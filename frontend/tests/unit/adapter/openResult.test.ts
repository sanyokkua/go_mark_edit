import { appModelAdapter } from '../../../src/logic/adapter';
import { setBootstrapStatus } from '../../../src/logic/adapter/command';
import type { OpenResult } from '../../../src/logic/store/appModelTypes';

type LinkBinding = (request: unknown, documentId: string, href: string) => Promise<OpenResult>;

const originalGo = (window as Window & { go?: unknown }).go;

afterEach(() => {
    (window as Window & { go?: unknown }).go = originalGo;
    setBootstrapStatus('loading');
});

function respondWith(result: OpenResult): void {
    const openPreviewLink: LinkBinding = async () => result;
    (window as Window & { go?: unknown }).go = {
        appmodel: { AppModelHandler: { OpenPreviewLink: openPreviewLink } },
    };
    setBootstrapStatus('ready');
}

it('carries reveal and tree paths from the OpenPreviewLink bridge result', async () => {
    respondWith({ status: 'refused', revealPath: '/outside/report.pdf', treePath: '/workspace/report.md' });

    const result = await appModelAdapter.openPreviewLink?.('source', './report.pdf');

    expect(result).toMatchObject({
        revealPath: '/outside/report.pdf',
        treePath: '/workspace/report.md',
    });
});

it('leaves reveal and tree paths absent when the bridge omits them', async () => {
    respondWith({ status: 'opened', documentId: 'target' });

    const result = await appModelAdapter.openPreviewLink?.('source', './target.md');

    expect(Object.hasOwn(result ?? {}, 'revealPath')).toBe(false);
    expect(Object.hasOwn(result ?? {}, 'treePath')).toBe(false);
});

it('carries readingMode only when the bridge reports it', async () => {
    respondWith({ status: 'opened', documentId: 'target', readingMode: true });
    expect((await appModelAdapter.openPreviewLink?.('source', './target.md'))?.readingMode).toBe(true);

    respondWith({ status: 'opened', documentId: 'target' });
    const result = await appModelAdapter.openPreviewLink?.('source', './target.md');
    expect(Object.hasOwn(result ?? {}, 'readingMode')).toBe(false);
});
