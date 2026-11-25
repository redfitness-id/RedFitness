export const CONSENT_EVENT = 'redfitness:analytics-consent';
export const CONSENT_READY_EVENT = 'redfitness:analytics-consent-ready';

export function listenForAnalyticsConsent(target: EventTarget, apply: (value: 'granted' | 'denied') => void) {
  const listener = (event: Event) => {
    const choice: unknown = (event as CustomEvent<unknown>).detail;
    if (choice === 'granted' || choice === 'denied') apply(choice);
  };
  target.addEventListener(CONSENT_EVENT, listener);
  return () => target.removeEventListener(CONSENT_EVENT, listener);
}
