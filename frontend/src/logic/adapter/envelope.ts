import { store } from '../store';
import { notifyError } from '../store/notificationsSlice';
import type { WireError } from '../utils/parseError';

export interface ResultEnvelope<T> {
  data?: T;
  error?: WireError;
}

export function unwrap<T>(result: ResultEnvelope<T>): T {
  if (result.error !== undefined) {
    store.dispatch(notifyError(result.error));
    throw result.error;
  }

  return result.data as T;
}
