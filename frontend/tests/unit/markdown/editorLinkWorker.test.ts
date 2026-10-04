import type { EditorLinkWorkerReply } from '../../../src/logic/markdown/editorLinkWorkerProtocol';

test('the worker uses the real Full AST extractor for references and source ranges', async () => {
    const addListener = jest.spyOn(self, 'addEventListener');
    const postMessage = jest.spyOn(self, 'postMessage').mockImplementation(() => undefined);
    try {
        await import('../../../src/logic/markdown/editorLinkWorker');
        const listener = addListener.mock.calls.find(([type]) => type === 'message')?.[1] as EventListener;
        expect(listener).toEqual(expect.any(Function));
        const text = '[named][target] `[ignored](bad.md)`\n\n[target]: good.md';
        listener(new MessageEvent('message', { data: { text } }));
        expect(postMessage).toHaveBeenCalledWith({
            type: 'links',
            links: [
                { href: 'good.md', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 16 } },
            ],
        } satisfies EditorLinkWorkerReply);
    } finally {
        addListener.mockRestore();
        postMessage.mockRestore();
    }
});
