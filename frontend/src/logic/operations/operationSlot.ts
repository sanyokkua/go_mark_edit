export type OperationKind = 'format' | 'compact' | 'lint';

export type OperationSlotState =
    | { state: 'idle' }
    | {
          state: 'running';
          kind: OperationKind;
          documentId: string;
          progress: { done: number; total: number } | null;
      };

export interface OperationHandle {
    signal: AbortSignal;
    abort(): void;
    setProgress(done: number, total: number): void;
    release(): void;
}

interface ActiveRun {
    controller: AbortController;
    kind: OperationKind;
    documentId: string;
    done: number;
    total: number;
    timer: ReturnType<typeof setTimeout> | null;
    visible: boolean;
}

const IDLE: OperationSlotState = { state: 'idle' };
const PROGRESS_DELAY_MS = 1000;
const LARGE_DOCUMENT_BYTES = 1024 * 1024;
const listeners = new Set<() => void>();

let active: ActiveRun | null = null;
let snapshot: OperationSlotState = IDLE;

function publish(run: ActiveRun | null): void {
    snapshot = run
        ? {
              state: 'running',
              kind: run.kind,
              documentId: run.documentId,
              progress: run.visible ? { done: run.done, total: run.total } : null,
          }
        : IDLE;
    for (const listener of [...listeners]) listener();
}

export function getSnapshot(): OperationSlotState {
    return snapshot;
}

export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return (): void => {
        listeners.delete(listener);
    };
}

export function acquire(
    kind: OperationKind,
    { documentId, size }: { documentId: string; size: number },
): OperationHandle | null {
    if (active) return null;

    const run: ActiveRun = {
        controller: new AbortController(),
        kind,
        documentId,
        done: 0,
        total: 0,
        timer: null,
        visible: size > LARGE_DOCUMENT_BYTES,
    };
    active = run;
    if (!run.visible) {
        run.timer = setTimeout(() => {
            if (active !== run) return;
            run.timer = null;
            run.visible = true;
            publish(run);
        }, PROGRESS_DELAY_MS);
    }
    publish(run);

    return {
        signal: run.controller.signal,
        abort(): void {
            if (active === run) run.controller.abort();
        },
        setProgress(done: number, total: number): void {
            if (active !== run || (run.done === done && run.total === total)) return;
            run.done = done;
            run.total = total;
            if (run.visible) publish(run);
        },
        release(): void {
            if (active !== run) return;
            if (run.timer !== null) clearTimeout(run.timer);
            active = null;
            publish(null);
        },
    };
}
