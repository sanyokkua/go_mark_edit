import type { TidyOutcome, TidyRequest, WorkerReply } from './protocol';
import { createTidyWorker } from './workerFactory';

export interface TidyControl {
    signal: AbortSignal;
    onProgress(done: number, total: number): void;
}

let warmWorker: Worker | null = null;
let running = false;
let nextId = 0;

export function runTidy(request: TidyRequest, control: TidyControl): Promise<TidyOutcome> {
    if (control.signal.aborted) return Promise.resolve({ kind: 'cancelled' });
    if (running) return Promise.resolve({ kind: 'failed' });
    running = true;
    let worker: Worker;
    try {
        worker = warmWorker ?? createTidyWorker();
        warmWorker = worker;
    } catch {
        running = false;
        return Promise.resolve({ kind: 'failed' });
    }
    const id = ++nextId;
    return new Promise<TidyOutcome>((resolve) => {
        let done = false;
        const finish = (outcome: TidyOutcome, discard: boolean): void => {
            if (done) return;
            done = true;
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            worker.removeEventListener('messageerror', onError);
            control.signal.removeEventListener('abort', onAbort);
            if (discard) {
                worker.terminate();
                if (warmWorker === worker) warmWorker = null;
            }
            running = false;
            resolve(outcome);
        };
        const onMessage = (event: MessageEvent<WorkerReply>): void => {
            const reply = event.data;
            if (reply.id !== id || done) return;
            if (reply.type === 'progress') {
                try {
                    control.onProgress(reply.done, reply.total);
                } catch {
                    finish({ kind: 'failed' }, true);
                }
            } else {
                finish(reply.outcome, false);
            }
        };
        const onError = (): void => finish({ kind: 'failed' }, true);
        const onAbort = (): void => finish({ kind: 'cancelled' }, true);
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.addEventListener('messageerror', onError);
        control.signal.addEventListener('abort', onAbort, { once: true });
        if (control.signal.aborted) {
            onAbort();
            return;
        }
        try {
            worker.postMessage({ id, ...request });
        } catch {
            finish({ kind: 'failed' }, true);
        }
    });
}
