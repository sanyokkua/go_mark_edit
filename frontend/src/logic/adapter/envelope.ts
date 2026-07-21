import { store } from '../store';
import { notifyError } from '../store/notificationsSlice';
import { parseError, type WireError } from '../utils/parseError';

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

export async function unwrapPromise<T>(
  resultPromise: Promise<ResultEnvelope<T>>,
): Promise<T> {
  let result: ResultEnvelope<T>;
  try {
    result = await resultPromise;
  } catch (error) {
    const wireError = parseError(error);
    store.dispatch(notifyError(wireError));
    throw wireError;
  }

  return unwrap(result);
}
