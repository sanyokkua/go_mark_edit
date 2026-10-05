import type { EditorLink } from '../../../src/logic/markdown/editorLinks';

jest.mock('../../../src/logic/markdown/editorLinkWorkerFactory', () => ({ createEditorLinkWorker: jest.fn() }));

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
    emit(data: unknown): void {
        this.listeners.get('message')?.forEach((listener) => listener({ data } as MessageEvent));
    }
    fail(type: 'error' | 'messageerror'): void {
        this.listeners.get(type)?.forEach((listener) => listener(new Event(type)));
    }
}

let workers: FakeWorker[];
let runEditorLinkExtraction: typeof import('../../../src/logic/markdown/runEditorLinkExtraction').runEditorLinkExtraction;
let createEditorLinkWorker: jest.MockedFunction<
    typeof import('../../../src/logic/markdown/editorLinkWorkerFactory').createEditorLinkWorker
>;
let warning: jest.SpyInstance;

beforeEach(async () => {
    warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.resetModules();
    runEditorLinkExtraction = (await import('../../../src/logic/markdown/runEditorLinkExtraction'))
        .runEditorLinkExtraction;
    createEditorLinkWorker = (await import('../../../src/logic/markdown/editorLinkWorkerFactory'))
        .createEditorLinkWorker as jest.MockedFunction<typeof createEditorLinkWorker>;
    workers = [];
    createEditorLinkWorker.mockImplementation(() => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
    });
});

afterEach(() => warning.mockRestore());

const link: EditorLink = {
    href: 'next.md',
    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 11 },
};

test('sends exact text, returns worker links, and releases the worker', async () => {
    const result = runEditorLinkExtraction('[next](next.md)', new AbortController().signal);
    expect(workers[0].posted).toEqual([{ text: '[next](next.md)' }]);
    workers[0].emit({ type: 'links', links: [link] });
    expect(await result).toEqual({ kind: 'links', links: [link] });
    expect(workers[0].terminated).toBe(true);
    expect([...workers[0].listeners.values()].every((group) => group.size === 0)).toBe(true);
    expect(warning).not.toHaveBeenCalled();
});

test('aborting settles immediately, terminates a parser, and permits another request', async () => {
    const control = new AbortController();
    const first = runEditorLinkExtraction('old', control.signal);
    control.abort();
    expect(await first).toEqual({ kind: 'cancelled' });
    expect(workers[0].terminated).toBe(true);
    workers[0].emit({ type: 'links', links: [link] });
    const second = runEditorLinkExtraction('new', new AbortController().signal);
    workers[1].emit({ type: 'links', links: [] });
    expect(await second).toEqual({ kind: 'links', links: [] });
    expect(warning).not.toHaveBeenCalled();
});

test.each([
    ['error', 'Editor links unavailable: Markdown link worker failed.'],
    ['messageerror', 'Editor links unavailable: Markdown link worker reply could not be decoded.'],
] as const)('%s settles as failed and logs one safe reason', async (type, reason) => {
    const result = runEditorLinkExtraction('text', new AbortController().signal);
    workers[0].fail(type);
    expect(await result).toEqual({ kind: 'failed' });
    expect(workers[0].terminated).toBe(true);
    workers[0].fail(type);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(reason);

    const retry = runEditorLinkExtraction('retry', new AbortController().signal);
    workers[1].emit({ type: 'links', links: [link] });
    expect(await retry).toEqual({ kind: 'links', links: [link] });
    expect(warning).toHaveBeenCalledTimes(1);
});

test('a parser failure logs one safe reason without document content', async () => {
    const result = runEditorLinkExtraction('/Users/alice/private.md secret text', new AbortController().signal);
    workers[0].emit({ type: 'failed' });
    workers[0].emit({ type: 'failed' });
    expect(await result).toEqual({ kind: 'failed' });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('Editor links unavailable: Markdown link extraction failed.');
});

test('worker startup failure logs a fixed reason without raw errors', async () => {
    createEditorLinkWorker.mockImplementationOnce(() => {
        throw new Error('start failed for /Users/alice/private.md');
    });
    expect(await runEditorLinkExtraction('secret text', new AbortController().signal)).toEqual({ kind: 'failed' });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('Editor links unavailable: Markdown link worker could not start.');
});

test('postMessage failure logs a fixed reason and discards the worker', async () => {
    createEditorLinkWorker.mockImplementationOnce(() => {
        const worker = new FakeWorker();
        worker.postMessage = () => {
            throw new Error('post failed for /Users/alice/private.md');
        };
        workers.push(worker);
        return worker as unknown as Worker;
    });
    expect(await runEditorLinkExtraction('secret text', new AbortController().signal)).toEqual({ kind: 'failed' });
    expect(workers[0].terminated).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('Editor links unavailable: Markdown link request could not be sent.');
});

test('an already aborted request never creates a worker', async () => {
    const control = new AbortController();
    control.abort();
    expect(await runEditorLinkExtraction('text', control.signal)).toEqual({ kind: 'cancelled' });
    expect(workers).toHaveLength(0);
    expect(warning).not.toHaveBeenCalled();
});
