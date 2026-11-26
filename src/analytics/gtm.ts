import { approvedContainer, createAnalytics } from './events';
import { listenForAnalyticsConsent } from './consent';

type Layer = unknown[];
type AnalyticsWindow = Window & { dataLayer?: Layer };

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

function configuredContainer() {
  return approvedContainer(
    import.meta.env.PROD,
    window.location.origin,
    import.meta.env.VITE_GTM_ENABLED
  );
}

export function isAnalyticsEnabled() {
  return Boolean(configuredContainer());
}

function setAnalyticsConsent(value: 'granted' | 'denied') {
  if (value === consent) return;
  const id = configuredContainer();
  if (!id) return;

  if (value === 'denied') {
    consent = value;
    analytics.setConsent(value);
    layer?.push(consentCommand('update', false));
    return;
  }

  if (!layer) {
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
    layer.push(consentCommand('update', true));
  }

  consent = value;
  analytics.setConsent(value);
}

// Listen as soon as the app module initializes, before its route observer mounts.
listenForAnalyticsConsent(window, setAnalyticsConsent);
