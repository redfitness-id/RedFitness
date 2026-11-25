import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics } from './gtm';
import { CONSENT_READY_EVENT } from './consent';

export default function AnalyticsObserver() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    analytics.visit(pathname, search);
  }, [pathname, search]);

  useEffect(() => {
    // A CMP initialized earlier can now replay its current choice. A CMP
    // initialized later should publish its current choice when it is ready.
    window.dispatchEvent(new Event(CONSENT_READY_EVENT));
  }, []);

  return null;
}
