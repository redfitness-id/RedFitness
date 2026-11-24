import { useRef } from 'react';
import { TrialForm } from './events';
import { analytics } from './gtm';

export function useTrialAnalytics(formId: TrialForm) {
  const started = useRef(false);
  return {
    start() {
      if (started.current) return;
      started.current = analytics.formStart(formId);
    },
    begin(clubId: unknown) {
      return analytics.beginFormSubmit(formId, clubId);
    },
    reset() {
      started.current = false;
    },
  };
}
