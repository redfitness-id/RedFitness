import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics, CONSENT_EVENT, setAnalyticsConsent } from './gtm';

export default function AnalyticsObserver() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    analytics.visit(pathname, search);
  }, [pathname, search]);

  useEffect(() => {
    const handleConsent = (event: Event) => setAnalyticsConsent((event as CustomEvent<unknown>).detail);
    window.addEventListener(CONSENT_EVENT, handleConsent);
    return () => window.removeEventListener(CONSENT_EVENT, handleConsent);
  }, []);

  return null;
}
