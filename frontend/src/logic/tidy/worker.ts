import { runOnText } from './engine';
import type { WorkerReply, WorkerRequest } from './protocol';

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const { id, op, text, prefs } = event.data;
    let outcome: Extract<WorkerReply, { type: 'result' }>['outcome'];
    try {
        outcome = runOnText(op, text, prefs, (done, total) => {
            self.postMessage({ id, type: 'progress', done, total } satisfies WorkerReply);
        });
    } catch {
        outcome = { kind: 'failed' };
    }
    self.postMessage({ id, type: 'result', outcome } satisfies WorkerReply);
});
