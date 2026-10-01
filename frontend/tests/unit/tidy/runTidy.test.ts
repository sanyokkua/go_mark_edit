import type { TidyRequest, WorkerReply } from '../../../src/logic/tidy/protocol';

jest.mock('../../../src/logic/tidy/workerFactory', () => ({ createTidyWorker: jest.fn() }));

const request: TidyRequest = {
    op: 'compact',
    text: 'one  \n',
    prefs: { bullet: '-', emphasis: '_', heading: 'atx' },
};

class FakeWorker {
    readonly listeners = new Map<string, Set<EventListener>>();
    posted: unknown[] = [];
    terminated = false;

    addEventListener(type: string, listener: EventListener): void {
        const group = this.listeners.get(type) ?? new Set<EventListener>();
        group.add(listener);
        this.listeners.set(type, group);
    }

    removeEventListener(type: string, listener: EventListener): void {
        this.listeners.get(type)?.delete(listener);
    }

    postMessage(value: unknown): void {
        this.posted.push(value);
    }

    terminate(): void {
        this.terminated = true;
    }

    emit(reply: WorkerReply): void {
        this.listeners.get('message')?.forEach((listener) => listener({ data: reply } as MessageEvent));
    }

    fail(type: 'error' | 'messageerror'): void {
        this.listeners.get(type)?.forEach((listener) => listener(new Event(type)));
    }
}

let workers: FakeWorker[];
let runTidy: typeof import('../../../src/logic/tidy/runTidy').runTidy;
let createTidyWorker: jest.MockedFunction<typeof import('../../../src/logic/tidy/workerFactory').createTidyWorker>;

beforeEach(async () => {
    jest.resetModules();
    runTidy = (await import('../../../src/logic/tidy/runTidy')).runTidy;
    createTidyWorker = (await import('../../../src/logic/tidy/workerFactory')).createTidyWorker as jest.MockedFunction<
        typeof createTidyWorker
    >;
    workers = [];
    createTidyWorker.mockImplementation(() => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
    });
});

afterEach(() => {
    workers.at(-1)?.fail('error');
    jest.clearAllMocks();
});

test('when a worker reports progress and edits, the client forwards progress and returns that outcome', async () => {
    const control = new AbortController();
    const progress: Array<[number, number]> = [];
    const result = runTidy(request, {
        signal: control.signal,
        onProgress: (done, total) => progress.push([done, total]),
    });
    const id = (workers[0].posted[0] as { id: number }).id;
    workers[0].emit({ id, type: 'progress', done: 1, total: 2 });
    workers[0].emit({ id, type: 'result', outcome: { kind: 'edits', edits: [{ from: 3, to: 5, text: '' }] } });
    expect(progress).toEqual([[1, 2]]);
    expect(await result).toEqual({ kind: 'edits', edits: [{ from: 3, to: 5, text: '' }] });
});

test('when a reply has another id, the client ignores it until the matching result arrives', async () => {
    const control = new AbortController();
    const progress: Array<[number, number]> = [];
    const result = runTidy(request, {
        signal: control.signal,
        onProgress: (done, total) => progress.push([done, total]),
    });
    const id = (workers[0].posted[0] as { id: number }).id;
    workers[0].emit({ id: id + 1, type: 'progress', done: 99, total: 99 });
    workers[0].emit({ id: id + 1, type: 'result', outcome: { kind: 'failed' } });
    expect(progress).toEqual([]);
    workers[0].emit({ id, type: 'result', outcome: { kind: 'edits', edits: [] } });
    expect(await result).toEqual({ kind: 'edits', edits: [] });
});

test('when aborted, the client terminates the worker and never reuses it', async () => {
    const firstControl = new AbortController();
    const first = runTidy(request, { signal: firstControl.signal, onProgress: () => undefined });
    firstControl.abort();
    expect(await first).toEqual({ kind: 'cancelled' });
    expect(workers[0].terminated).toBe(true);

    const secondControl = new AbortController();
    const second = runTidy(request, { signal: secondControl.signal, onProgress: () => undefined });
    expect(workers).toHaveLength(2);
    const id = (workers[1].posted[0] as { id: number }).id;
    workers[1].emit({ id, type: 'result', outcome: { kind: 'edits', edits: [] } });
    expect(await second).toEqual({ kind: 'edits', edits: [] });
});

test.each(['error', 'messageerror'] as const)('when the worker emits %s, the client fails', async (type) => {
    const control = new AbortController();
    const result = runTidy(request, { signal: control.signal, onProgress: () => undefined });
    workers[0].fail(type);
    expect(await result).toEqual({ kind: 'failed' });
});

test('when posting to a worker fails, the client fails and discards that worker', async () => {
    createTidyWorker.mockImplementationOnce(() => {
        const worker = new FakeWorker();
        worker.postMessage = () => {
            throw new Error('post failed');
        };
        workers.push(worker);
        return worker as unknown as Worker;
    });
    const control = new AbortController();
    expect(await runTidy(request, { signal: control.signal, onProgress: () => undefined })).toEqual({ kind: 'failed' });
    expect(workers[0].terminated).toBe(true);
});

test('when one request finishes, the next may reuse its warm worker with a larger id', async () => {
    const firstControl = new AbortController();
    const first = runTidy(request, { signal: firstControl.signal, onProgress: () => undefined });
    const firstId = (workers[0].posted[0] as { id: number }).id;
    workers[0].emit({ id: firstId, type: 'result', outcome: { kind: 'edits', edits: [] } });
    expect(await first).toEqual({ kind: 'edits', edits: [] });
    const secondControl = new AbortController();
    const second = runTidy(request, { signal: secondControl.signal, onProgress: () => undefined });
    expect(workers).toHaveLength(1);
    const secondId = (workers[0].posted[1] as { id: number }).id;
    expect(secondId).toBeGreaterThan(firstId);
    workers[0].emit({ id: secondId, type: 'result', outcome: { kind: 'edits', edits: [] } });
    expect(await second).toEqual({ kind: 'edits', edits: [] });
});

test('when a signal is already aborted, the client returns cancelled without creating a worker', async () => {
    const control = new AbortController();
    control.abort();
    expect(await runTidy(request, { signal: control.signal, onProgress: () => undefined })).toEqual({
        kind: 'cancelled',
    });
    expect(workers).toHaveLength(0);
});
