import { apperr } from 'wailsjs/go/models';

// The mock mirrors the lifecycle acknowledgement without simulating native UI.
export function WindowReady(): Promise<apperr.VoidResult> {
  return Promise.resolve(new apperr.VoidResult({}));
}

export function RetryStartup(): Promise<apperr.VoidResult> {
  return Promise.resolve(new apperr.VoidResult({}));
}
