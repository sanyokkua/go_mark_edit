import type { WireError, WireErrorCode } from './parseError';

const marker = Symbol('buffer-sync-error');

export class BufferSyncError extends Error implements WireError {
    readonly code: WireErrorCode;
    readonly title: string;
    readonly retryable: boolean;
    readonly details?: Record<string, string>;

    constructor(error: WireError) {
        super(error.message);
        this.code = error.code;
        this.title = error.title;
        this.retryable = error.retryable;
        this.details = error.details;
        Object.defineProperty(this, marker, { value: true });
    }
}

export function markBufferSyncError<T extends object>(error: T): T {
    return Object.defineProperty({ ...error }, marker, { value: true });
}

export function isBufferSyncError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && marker in error;
}
