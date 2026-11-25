import type { FormOutcome } from './events';

export function classifyTrialOutcome(data: unknown, error: unknown): FormOutcome {
  if (error != null) return 'request_failed';
  if (typeof data === 'object' && data !== null && 'success' in data && data.success === true) {
    return 'success';
  }
  return 'unexpected_response';
}

export const unconfirmedTrialMessages = {
  request_failed: 'Something went wrong while sending your request. It may already have been received. Please check with your club before trying again.',
  unexpected_response: 'We did not receive confirmation of your request. It may already have been received. Please check with your club before trying again.',
};
