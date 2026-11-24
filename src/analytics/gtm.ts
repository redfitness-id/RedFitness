import { approvedContainer, createAnalytics } from './events';

type Layer = unknown[];
type AnalyticsWindow = Window & { dataLayer?: Layer };

export const CONSENT_EVENT = 'redfitness:analytics-consent';

function consentCommand(action: 'default' | 'update', granted: boolean) {
  // GTM's consent queue expects the gtag arguments object.
  function command(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params -- GTM consumes the gtag arguments object.
    return arguments;
  }
  return command('consent', action, {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
}

let layer: Layer | undefined;
let consent: 'granted' | 'denied' = 'denied';

export const analytics = createAnalytics((event) => layer?.push(event));

export function setAnalyticsConsent(value: unknown) {
  if ((value !== 'granted' && value !== 'denied') || value === consent) return;
  const id = approvedContainer(
    import.meta.env.PROD,
    window.location.origin,
    import.meta.env.VITE_GTM_ENABLED,
    import.meta.env.VITE_GTM_CONTAINER_ID
  );
  if (!id) return;

  if (value === 'granted' && !layer) {
    const target = window as AnalyticsWindow;
    if (document.querySelector('script[src^="https://www.googletagmanager.com/gtm.js"]')
      || (target.dataLayer !== undefined && !Array.isArray(target.dataLayer))) return;
    target.dataLayer = target.dataLayer ?? [];
    layer = target.dataLayer;
    layer.push(consentCommand('default', false), consentCommand('update', true));
    layer.push({ event: 'gtm.js', 'gtm.start': Date.now() });
    const script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
  } else if (layer) {
    layer.push(consentCommand('update', value === 'granted'));
  }

  consent = value;
  analytics.setConsent(value);
}
