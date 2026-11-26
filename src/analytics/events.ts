const GTM_CONTAINER = 'GTM-KZL3DGV9';

export const ANALYTICS_ORIGIN = 'https://www.redfitness.co.id';

const pages: Record<string, string> = {
  '/': 'home',
  '/membership': 'membership',
  '/personal-training': 'personal_training',
  '/pilates-performer': 'pilates_performer',
  '/red-seitai': 'red_seitai',
  '/clubs': 'clubs',
  '/classes': 'classes',
  '/timetable': 'timetable',
  '/highligth': 'highlights',
  '/career': 'career',
};

const services: Record<string, string> = {
  membership: 'membership',
  personal_training: 'personal_training',
  pilates_performer: 'pilates_performer',
  red_seitai: 'red_seitai',
};

const navigationTargets: Record<string, string> = {
  '/membership': 'membership',
  '/personal-training': 'personal_training',
  '/pilates-performer': 'pilates_performer',
  '/red-seitai': 'red_seitai',
  '/classes': 'classes',
  '/highligth': 'highlights',
};

const sources = ['google', 'facebook', 'instagram', 'meta', 'tiktok', 'bing', 'whatsapp', 'google_business_profile'];
const mediums = ['cpc', 'paid_social', 'organic', 'organic_social', 'referral', 'email'];
const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term',
  'utm_content', 'gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid'];

type CtaLocation = 'desktop_nav' | 'mobile_nav';
export type TrialForm = 'inline_free_trial' | 'sticky_free_trial';
export type FormOutcome = 'success' | 'request_failed' | 'unexpected_response';
type Consent = 'granted' | 'denied';
export type AnalyticsEvent = { event: string } & Record<string, string>;
type Context = {
  page_path: string;
  page_name: string;
  page_location: string;
  page_referrer: string;
  service_id: string;
  campaign_tagged: string;
  campaign_source: string;
  campaign_medium: string;
};

export function approvedContainer(productionBuild: boolean, origin: string, enabled: unknown) {
  return productionBuild && origin === ANALYTICS_ORIGIN && enabled === 'true' ? GTM_CONTAINER : undefined;
}

export function readCampaign(search: string) {
  const query = new URLSearchParams(search);
  const source = query.get('utm_source')?.toLowerCase() ?? '';
  const medium = query.get('utm_medium')?.toLowerCase() ?? '';
  return {
    campaign_tagged: campaignKeys.some((key) => query.has(key)) ? 'yes' : 'no',
    campaign_source: sources.includes(source) ? source : '',
    campaign_medium: mediums.includes(medium) ? medium : '',
  };
}

function getClubId(value: unknown) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : '';
}

export function isWhatsAppUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === 'https://wa.me' && !url.username && !url.password && /^\/[1-9]\d{6,14}\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function createAnalytics(publish: (payload: AnalyticsEvent) => void) {
  let consent: Consent = 'denied';
  let consentRevision = 0;
  let current: Context | undefined;
  let lastViewedPath: string | undefined;
  let campaign = readCampaign('');

  function emit(event: string, context: Context | undefined, fields: Record<string, string> = {}) {
    if (consent !== 'granted' || !context) return false;
    // A dropped analytics event must not interrupt navigation or a form.
    try {
      publish({ event, ...context, cta_id: '', cta_location: '', club_id: '', club: '', service: '', form_id: '', error_code: '', ...fields });
      return true;
    } catch {
      return false;
    }
  }

  function view() {
    if (consent !== 'granted' || !current || lastViewedPath === current.page_path) return;
    lastViewedPath = current.page_path;
    emit('page_view', current);
    if (current.service_id) emit('service_view', current);
    if (current.page_name === 'clubs') emit('club_view', current, { cta_location: 'club_directory' });
  }

  return {
    setConsent(next: Consent) {
      if (next === consent) return;
      consent = next;
      consentRevision += 1;
      lastViewedPath = undefined;
      if (next === 'denied') {
        campaign = readCampaign('');
        if (current) current = { ...current, ...campaign };
      } else if (current?.campaign_tagged === 'yes') {
        const { campaign_source, campaign_medium, campaign_tagged } = current;
        campaign = { campaign_source, campaign_medium, campaign_tagged };
      }
      view();
    },
    visit(pathname: string, search: string) {
      const path = pathname.replace(/\/+$/, '').toLowerCase() || '/';
      if (!Object.prototype.hasOwnProperty.call(pages, path)) {
        current = undefined;
        lastViewedPath = undefined;
        return;
      }
      const incoming = readCampaign(search);
      if (consent === 'granted' && incoming.campaign_tagged === 'yes') campaign = incoming;
      const page = pages[path];
      current = {
        page_path: path, page_name: page, page_location: ANALYTICS_ORIGIN + path,
        page_referrer: '', service_id: services[page] ?? '',
        ...(incoming.campaign_tagged === 'yes' ? incoming : campaign),
      };
      view();
    },
    navigationClick(path: string, location: CtaLocation) {
      if (!Object.prototype.hasOwnProperty.call(navigationTargets, path)) return;
      const target = navigationTargets[path];
      emit('cta_click', current, {
        cta_id: `nav_${target}`, cta_location: location, service_id: services[target] ?? '',
      });
    },
    heroMembershipClick() {
      emit('cta_click', current, { cta_id: 'home_membership_primary', cta_location: 'home_hero', service_id: 'membership' });
    },
    clubCardView(clubId: unknown) {
      const id = getClubId(clubId);
      if (id) emit('club_view', current, { club_id: id, cta_location: 'home_club_carousel' });
    },
    whatsappClick(destination: string, clubId: unknown) {
      if (!isWhatsAppUrl(destination)) return;
      emit('whatsapp_click', current, { club_id: getClubId(clubId), cta_location: 'home_whatsapp' });
    },
    clubInquiryClick(destination: string, club: string, service: string) {
      // These labels come from the Marketing routing configuration, never from
      // user-entered fields. The destination is checked and never published.
      if (!isWhatsAppUrl(destination) || current?.page_path !== '/clubs') return;
      emit('whatsapp_click', current, { club, service, cta_location: 'club_directory' });
    },
    formStart(formId: TrialForm) {
      return emit('form_start', current, { form_id: formId });
    },
    beginFormSubmit(formId: TrialForm, clubId: unknown) {
      const context = consent === 'granted' ? current : undefined;
      const revision = consentRevision;
      const fields = { form_id: formId, club_id: getClubId(clubId) };
      let completed = false;
      emit('form_submit_attempt', context, fields);

      return (outcome: FormOutcome) => {
        if (completed || revision !== consentRevision) return;
        completed = true;
        if (outcome === 'success') emit('free_trial_submit_success', context);
        else emit('form_submit_error', context, { ...fields, error_code: outcome });
      };
    },
  };
}
