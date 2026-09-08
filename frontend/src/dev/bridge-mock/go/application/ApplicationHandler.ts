import { apperr } from 'wailsjs/go/models';

// The mock mirrors the lifecycle acknowledgement without simulating native UI.
export function WindowReady(): Promise<apperr.VoidResult> {
  return Promise.resolve(new apperr.VoidResult({}));
}

export function RetryStartup(): Promise<apperr.VoidResult> {
  return Promise.resolve(new apperr.VoidResult({}));
}

// Mirrors the real envelope, which carries a ClassifiedError so FR-FT-027's
// drain failure can reach the user as an io-failure offering Retry. The mock
// always succeeds: it has no persistence to drain, and a mock that could refuse
// would be inventing a failure the browser bridge cannot produce.
export function AuthorizeQuit(): Promise<apperr.ClassifiedVoidResult> {
  return Promise.resolve(new apperr.ClassifiedVoidResult({}));
}

export function CancelQuit(): Promise<apperr.VoidResult> {
  return Promise.resolve(new apperr.VoidResult({}));
}
