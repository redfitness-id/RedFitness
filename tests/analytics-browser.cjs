const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = new URL(process.env.MKT_TEST_URL || 'http://127.0.0.1:4210').origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const mockTransport = process.env.MKT_MOCK_TRANSPORT === '1';
const clubId = '12345678-1234-4567-9abc-123456789abc';
const fixtureClub = { id: clubId, name: 'Synthetic Club', city: 'Fixture', whatsapp_number: '12345678' };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.MKT_CHROMIUM_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const external = [];
    let submits = 0;
    let scenario = 'standard';
    let releaseResponse;
    let notifyRequestHeld;
    let simulatedPersistence = 0;
    await context.addInitScript(() => {
      window.open = () => null;
      const grant = () => window.dispatchEvent(new CustomEvent('redfitness:analytics-consent', { detail: 'granted' }));
      // Event before the app bundle has listeners. The CMP must replay on ready.
      grant();
      if (new URLSearchParams(location.search).has('replay')) {
        window.addEventListener('redfitness:analytics-consent-ready', grant);
      }
    });
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) {
        if (mockTransport && url.pathname === '/src/analytics/gtm.ts') {
          return route.fulfill({
            contentType: 'application/javascript',
            body: `
              import { createAnalytics } from '/src/analytics/events.ts';
              import { listenForAnalyticsConsent, CONSENT_EVENT } from '/src/analytics/consent.ts';
              window.__qaAnalytics = [];
              export const isAnalyticsEnabled = () => false;
              export const analytics = createAnalytics(event => window.__qaAnalytics.push(event));
              listenForAnalyticsConsent(window, analytics.setConsent);
              if (new URLSearchParams(location.search).has('before_observer')) {
                window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: 'granted' }));
              }
            `,
          });
        }
        return route.continue();
      }
      if (url.hostname === 'fixture.invalid') {
        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, accept-profile',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (url.pathname.includes('/functions/v1/send-registration-email')) {
          submits += 1;
          if (scenario === 'transport_failure') return route.abort('failed');
          if (scenario === 'persisted_then_error') {
            simulatedPersistence += 1;
            return route.fulfill({ status: 500, headers, json: { error: 'synthetic email error' } });
          }
          if (scenario === 'in_flight') {
            return new Promise((resolve) => {
              releaseResponse = () => resolve(route.fulfill({ headers, json: { success: true } }));
              notifyRequestHeld();
            });
          }
          // First request returns the confirmed contract. The second is a
          // transport success without the explicit application confirmation.
          return route.fulfill({ headers, json: submits === 1 ? { success: true } : {} });
        }
        if (url.pathname.endsWith('/clubs')) return route.fulfill({ headers, json: [fixtureClub] });
        const object = request.headers().accept?.includes('vnd.pgrst.object');
        return route.fulfill({ headers, json: object ? null : [] });
      }
      if (/google-analytics|googletagmanager/.test(url.hostname)) external.push(url.origin);
      return route.abort();
    });
    const page = await context.newPage();
    const setConsent = (value) => page.evaluate((detail) => {
      window.dispatchEvent(new CustomEvent('redfitness:analytics-consent', { detail }));
    }, value);
    const events = () => page.evaluate(() => window.__qaAnalytics);
    const waitForEvent = (name) => page.waitForFunction((event) => (
      window.__qaAnalytics.some((entry) => entry.event === event)
    ), name);
    const setRoute = (path) => page.evaluate((next) => {
      window.history.pushState(null, '', next);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.goto(`${origin}/?utm_source=google&utm_medium=cpc&gclid=private-fixture&email=person%40example.invalid`);
    await page.getByRole('link', { name: 'Membership', exact: true }).first().waitFor();
    if (mockTransport) assert.deepEqual(await events(), []);
    await setConsent('granted');
    if (!mockTransport) {
      await page.getByRole('link', { name: 'Membership', exact: true }).first().click();
      await page.waitForURL(`${origin}/membership`);
      assert.deepEqual(external, []);
      assert.equal(await page.evaluate(() => typeof window.dataLayer), 'undefined');
      console.log('PASS built app: consent on loopback creates no dataLayer and sends no analytics requests');
      return;
    }

    await waitForEvent('page_view');
    await setConsent('granted');
    await page.getByRole('link', { name: 'Membership', exact: true }).first().click();
    await page.waitForURL(`${origin}/membership`);
    await waitForEvent('service_view');
    await setRoute('/membership?utm_source=instagram');
    await setRoute('/clubs');
    await waitForEvent('club_view');
    await setRoute('/');
    await page.waitForFunction(() => window.__qaAnalytics.filter((e) => e.event === 'page_view').length === 4);
    await page.getByRole('button', { name: 'Chat Now', exact: true }).first().click();
    await waitForEvent('whatsapp_click');

    // Inline input labels differ from the sticky labels. Limit by visible
    // copy to avoid selecting the off-screen sticky fields in this fixture.
    const inlineEmail = page.getByLabel('Email Address *', { exact: true });
    await inlineEmail.fill('person@example.invalid');
    const inlineName = page.getByLabel('First Name *', { exact: true }).first();
    await inlineName.fill('Synthetic Firstname');
    await page.getByRole('button', { name: 'Claim My Free Week', exact: true }).click();
    await waitForEvent('free_trial_submit_success');
    await page.getByText('TRY US FOR FREE', { exact: true }).click();
    const sticky = page.getByText('CLOSE', { exact: true }).locator('..');
    await sticky.getByLabel('First Name *', { exact: true }).fill('Synthetic Sticky');
    await sticky.getByLabel('Email *', { exact: true }).fill('sticky@example.invalid');
    await sticky.getByRole('button', { name: 'Register Now', exact: true }).click();
    await waitForEvent('form_submit_error');
    await sticky.getByRole('alert').filter({ hasText: 'may already have been received' }).waitFor();
    assert.equal(await sticky.getByLabel('Email *', { exact: true }).inputValue(), 'sticky@example.invalid');
    assert.equal(await sticky.getByRole('button', { name: 'Register Now', exact: true }).isDisabled(), true);

    const result = await events();
    assert.deepEqual(result.filter((e) => e.event === 'page_view').map((e) => e.page_path), ['/', '/membership', '/clubs', '/']);
    assert.equal(result.filter((e) => e.event === 'cta_click' && e.cta_id === 'nav_membership').length, 1);
    assert.equal(result.filter((e) => e.event === 'whatsapp_click').length, 1);
    assert.equal(result.find((e) => e.event === 'whatsapp_click').club_id, clubId);
    assert.deepEqual(result.filter((e) => e.event === 'form_start').map((e) => e.form_id), ['inline_free_trial', 'sticky_free_trial']);
    assert.equal(result.filter((e) => e.event === 'form_submit_attempt').length, 2);
    assert.equal(result.find((e) => e.event === 'form_submit_error').error_code, 'unexpected_response');
    assert.equal(result[0].campaign_source, 'google');
    assert.doesNotMatch(JSON.stringify(result), /example\.invalid|private-fixture|Firstname|Synthetic Sticky|wa\.me|generate_lead/);
    await setConsent('denied');
    await setRoute('/personal-training');
    await page.waitForURL(`${origin}/personal-training`);
    assert.deepEqual(await events(), result);
    // Replay an earlier CMP choice on observer readiness, and separately
    // exercise a choice delivered after listener registration but before mount.
    for (const query of ['replay', 'before_observer']) {
      await page.goto(`${origin}/?${query}=1`);
      await waitForEvent('page_view');
      assert.deepEqual((await events()).map((e) => e.event), ['page_view']);
    }

    for (const outcome of ['transport_failure', 'persisted_then_error']) {
      scenario = outcome;
      await page.goto(`${origin}/?replay=1`);
      await waitForEvent('page_view');
      const email = page.getByLabel('Email Address *', { exact: true });
      await email.fill('fixture@example.invalid');
      await page.getByLabel('First Name *', { exact: true }).first().fill('Fixture');
      const submit = page.getByRole('button', { name: 'Claim My Free Week', exact: true });
      await submit.click();
      await waitForEvent('form_submit_error');
      await page.getByRole('alert').filter({ hasText: 'may already have been received' }).waitFor();
      assert.equal(await email.inputValue(), 'fixture@example.invalid');
      assert.equal(await submit.isDisabled(), true);
      assert.equal((await events()).at(-1).error_code, 'request_failed');
      assert.equal((await events()).some((e) => e.event === 'free_trial_submit_success'), false);
    }
    assert.equal(simulatedPersistence, 1);

    scenario = 'in_flight';
    const requestHeld = new Promise((resolve) => { notifyRequestHeld = resolve; });
    await page.goto(`${origin}/?replay=1`);
    await waitForEvent('page_view');
    await page.getByLabel('Email Address *', { exact: true }).fill('fixture@example.invalid');
    await page.getByLabel('First Name *', { exact: true }).first().fill('Fixture');
    await page.getByRole('button', { name: 'Claim My Free Week', exact: true }).click();
    await waitForEvent('form_submit_attempt');
    await requestHeld;
    await setConsent('denied');
    await setConsent('granted');
    assert.deepEqual((await events()).filter((e) => e.event === 'page_view').map((e) => e.page_path), ['/', '/']);
    await releaseResponse();
    await page.getByRole('button', { name: 'Register Again', exact: false }).first().waitFor();
    assert.equal((await events()).some((e) => e.event === 'free_trial_submit_success' || e.event === 'form_submit_error'), false);
    assert.deepEqual(external, []);
    console.log('PASS mocked browser: trial success, missing acknowledgment, transport error, possible persistence before mail error, consent replay/withdrawal/regrant and in-flight suppression');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
