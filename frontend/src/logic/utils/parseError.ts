export type WireErrorCode =
  | 'busy'
  | 'cancelled'
  | 'io'
  | 'internal'
  | 'not_found'
  | 'permission'
  | 'timeout'
  | 'unsupported'
  | 'validation';

export interface WireError {
  code: WireErrorCode;
  title: string;
  message: string;
  details?: Record<string, string>;
  retryable: boolean;
}

const fallbackTitle = 'Something went wrong';

function isWireErrorCode(value: unknown): value is WireErrorCode {
  return (
    value === 'busy' ||
    value === 'cancelled' ||
    value === 'io' ||
    value === 'internal' ||
    value === 'not_found' ||
    value === 'permission' ||
    value === 'timeout' ||
    value === 'unsupported' ||
    value === 'validation'
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

export function isWireError(value: unknown): value is WireError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const error = value as Record<string, unknown>;
  return (
    isWireErrorCode(error.code) &&
    typeof error.title === 'string' &&
    typeof error.message === 'string' &&
    typeof error.retryable === 'boolean' &&
    (error.details === undefined || isStringRecord(error.details))
  );
}

export function parseError(error: unknown): WireError {
  if (isWireError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    code: 'internal',
    title: fallbackTitle,
    message,
    retryable: true,
  };
}
