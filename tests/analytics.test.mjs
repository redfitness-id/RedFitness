import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYTICS_ORIGIN, approvedContainer, createAnalytics, isWhatsAppUrl, readCampaign,
} from '../src/analytics/events.ts';

const club = '12345678-1234-4567-9abc-123456789abc';

function fixture() {
  const events = [];
  const analytics = createAnalytics((event) => events.push(event));
  return { analytics, events };
}

test('missing, malformed, preview and development GTM settings stay disabled', () => {
  for (const args of [
    [true, ANALYTICS_ORIGIN, 'true', undefined],
    [true, ANALYTICS_ORIGIN, 'true', 'invalid configuration'],
    [true, 'https://preview.example.invalid', 'true', undefined],
    [false, ANALYTICS_ORIGIN, 'true', undefined],
    [true, ANALYTICS_ORIGIN, 'false', undefined],
  ]) assert.equal(approvedContainer(...args), undefined);
});

test('consent gates events and path changes deduplicate SPA page views', () => {
  const { analytics, events } = fixture();
  analytics.visit('/', '');
  analytics.heroMembershipClick();
  assert.deepEqual(events, []);
  analytics.setConsent('granted');
  analytics.setConsent('granted');
  analytics.visit('/', '?utm_source=google');
  analytics.visit('/membership/', '');
  analytics.visit('/Membership', '');
  analytics.visit('/personal-training', '');
  analytics.visit('/rf-admin/registrations', '');
  analytics.visit('/clubs', '');
  analytics.visit('/membership', '');
  assert.deepEqual(events.filter((e) => e.event === 'page_view').map((e) => e.page_path),
    ['/', '/membership', '/personal-training', '/clubs', '/membership']);
  assert.deepEqual(events.filter((e) => e.event === 'service_view').map((e) => e.service_id),
    ['membership', 'personal_training', 'membership']);
  assert.equal(events.find((e) => e.event === 'club_view').cta_location, 'club_directory');
  analytics.setConsent('denied');
  analytics.visit('/pilates-performer','');
  assert.equal(events.some((e)=>e.service_id === 'pilates_performer'),false);
  analytics.setConsent('granted');
  assert.equal(events.at(-1).campaign_source, '');
  assert.equal(events.at(-1).service_id, 'pilates_performer');
});

test('campaign signals are fixed classifications without raw campaign or click values', () => {
  assert.deepEqual(readCampaign('?utm_source=Google&utm_medium=CPC&gclid=raw-click'),
    {campaign_tagged:'yes',campaign_source:'google',campaign_medium:'cpc'});
  const { analytics, events } = fixture();
  analytics.visit('/', '?utm_source=fixture%40example.invalid&utm_medium=cpc&utm_campaign=private&gclid=raw-click&email=private');
  analytics.setConsent('granted');
  analytics.visit('/red-seitai', '');
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /example\.invalid|raw-click|private|utm_|\?/);
  assert.equal(events.at(-1).campaign_medium,'cpc');
  assert.equal(events.at(-1).campaign_tagged,'yes');
  assert.equal(events.at(-1).page_location, `${ANALYTICS_ORIGIN}/red-seitai`);
  assert.equal(events.at(-1).page_referrer, '');
});

test('captures known CTA and club context and only validated wa.me destinations', () => {
  const { analytics, events } = fixture();
  analytics.visit('/', '');
  analytics.setConsent('granted');
  analytics.navigationClick('/pilates-performer', 'mobile_nav');
  analytics.navigationClick('https://example.invalid/unsafe', 'mobile_nav');
  analytics.clubCardView(club);
  analytics.clubCardView('fixture@example.invalid');
  for (const url of ['https://wa.me.evil.invalid/12345678', 'https://wa.me/user', 'http://wa.me/12345678']) {
    assert.equal(isWhatsAppUrl(url), false);
    analytics.whatsappClick(url, club);
  }
  analytics.whatsappClick('https://wa.me/12345678?text=fixture', club);
  assert.deepEqual(events.map((e)=>e.event), ['page_view','cta_click','club_view','whatsapp_click']);
  assert.equal(events[1].service_id,'pilates_performer');
  assert.equal(events[2].club_id,club);
  assert.equal(events[3].club_id,club);
  assert.doesNotMatch(JSON.stringify(events), /12345678\?text|wa\.me|example\.invalid/);
});

test('form completion is once per attempt, tied to its origin and consent window', () => {
  const { analytics, events } = fixture();
  analytics.visit('/', '');
  const denied = analytics.beginFormSubmit('inline_free_trial', club);
  analytics.setConsent('granted');
  denied('success');
  analytics.formStart('inline_free_trial');
  const complete = analytics.beginFormSubmit('inline_free_trial', club);
  analytics.visit('/membership','');
  complete('success');
  complete('request_failed');
  assert.equal(events.at(-1).event, 'form_submit_success');
  assert.equal(events.at(-1).page_path, '/');
  assert.equal(events.at(-1).club_id, club);
  analytics.beginFormSubmit('sticky_free_trial', 'fixture@example.invalid')('unexpected_response');
  assert.equal(events.at(-1).event,'form_submit_error');
  assert.equal(events.at(-1).error_code,'unexpected_response');
  assert.equal(events.at(-1).club_id,'');
  const revoked = analytics.beginFormSubmit('sticky_free_trial', club);
  analytics.setConsent('denied');
  analytics.setConsent('granted');
  revoked('success');
  assert.equal(events.filter((e)=>e.event === 'form_submit_success').length, 1);
  assert.equal(events.some((e)=>e.event === 'generate_lead'),false);
});
