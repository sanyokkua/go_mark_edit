import type { editor, languages, Uri } from 'monaco-editor';
import type { EditorLink } from '../../../src/logic/markdown/editorLinks';

const registerLinkProvider = jest.fn();
const registerLinkOpener = jest.fn();
const disposeProvider = jest.fn();
const disposeOpener = jest.fn();
const runEditorLinkExtraction = jest.fn();
let activeOpener: { open(uri: Uri): boolean };
let activeProvider: languages.LinkProvider;
let registeredSelector: unknown;

jest.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
    editor: { registerLinkOpener, defineTheme: jest.fn(), setTheme: jest.fn() },
    languages: {
        registerLinkProvider,
        register: jest.fn(),
        registerTokensProviderFactory: jest.fn(),
        setMonarchTokensProvider: jest.fn(),
    },
    Uri: {
        from: (parts: { scheme: string; authority?: string; path: string }) => ({ ...parts, query: '', fragment: '' }),
    },
}));
jest.mock('monaco-editor/esm/vs/editor/browser/coreCommands', () => ({}));
jest.mock('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution', () => ({}));
jest.mock('monaco-editor/esm/vs/basic-languages/_.contribution', () => ({ registerLanguage: jest.fn() }));
jest.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution', () => ({}));
jest.mock('monaco-editor/esm/vs/editor/contrib/links/browser/links', () => ({}));
jest.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => jest.fn(), { virtual: true });
jest.mock('../../../src/logic/markdown/runEditorLinkExtraction', () => ({ runEditorLinkExtraction }));

import { registerEditorLinkModel } from '../../../src/ui/components/monacoSetup';

type ExtractionResult = { kind: 'links'; links: EditorLink[] } | { kind: 'failed' } | { kind: 'cancelled' };
type Pending = { text: string; signal: AbortSignal; resolve(result: ExtractionResult): void };
let pending: Pending[];

function model(initial: string): { instance: editor.ITextModel; set(text: string): void } {
    let text = initial;
    let version = 1;
    return {
        instance: { getValue: () => text, getVersionId: () => version } as editor.ITextModel,
        set(next) {
            text = next;
            version += 1;
        },
    };
}

function cancellationToken(): { token: Parameters<languages.LinkProvider['provideLinks']>[1]; cancel(): void } {
    let cancelled = false;
    const listeners = new Set<(event: unknown) => unknown>();
    return {
        token: {
            get isCancellationRequested() {
                return cancelled;
            },
            onCancellationRequested: (listener: (event: unknown) => unknown) => {
                listeners.add(listener);
                return {
                    dispose: () => {
                        listeners.delete(listener);
                    },
                };
            },
        },
        cancel() {
            cancelled = true;
            listeners.forEach((listener) => listener(undefined));
        },
    };
}

function provider(): languages.LinkProvider {
    return activeProvider;
}

function link(href: string): EditorLink {
    return { href, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 10 } };
}

async function request(instance: editor.ITextModel, token = cancellationToken().token): Promise<languages.ILinksList> {
    return (await provider().provideLinks(instance, token)) as languages.ILinksList;
}

beforeEach(() => {
    pending = [];
    runEditorLinkExtraction.mockImplementation(
        (text: string, signal: AbortSignal) =>
            new Promise<ExtractionResult>((resolve) => {
                pending.push({ text, signal, resolve });
            }),
    );
    registerLinkProvider.mockImplementation((selector: unknown, linkProvider: languages.LinkProvider) => {
        registeredSelector = selector;
        activeProvider = linkProvider;
        return { dispose: disposeProvider };
    });
    registerLinkOpener.mockImplementation((opener: { open(uri: Uri): boolean }) => {
        activeOpener = opener;
        return { dispose: disposeOpener };
    });
    jest.clearAllMocks();
});

test('routes parsed links to each registered model, then consumes stale URLs after disposal', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const firstModel = model('[first](a.md)');
    const secondModel = model('[second](b.md)');
    const firstRegistration = registerEditorLinkModel(firstModel.instance, first);
    const secondRegistration = registerEditorLinkModel(secondModel.instance, second);
    expect(registeredSelector).toEqual({ language: 'markdown', exclusive: true });
    expect(typeof provider().provideLinks).toBe('function');
    expect(registerLinkProvider).toHaveBeenCalledTimes(1);
    expect(registerLinkOpener).toHaveBeenCalledTimes(1);
    const firstRequest = request(firstModel.instance);
    const secondRequest = request(secondModel.instance);
    expect(pending.map(({ text }) => text)).toEqual(['[first](a.md)', '[second](b.md)']);
    pending[0].resolve({ kind: 'links', links: [link('a.md')] });
    pending[1].resolve({ kind: 'links', links: [link('b.md')] });
    const firstLinks = await firstRequest;
    const secondLinks = await secondRequest;
    const firstUrl = firstLinks.links[0].url as Uri;
    expect(firstUrl).toMatchObject({
        scheme: 'https',
        authority: 'editor-link.gomarkedit.invalid',
        query: '',
        fragment: '',
    });
    expect(firstUrl.path).toMatch(/^\/\d+\/\d+\/\d+$/u);
    expect(activeOpener.open(secondLinks.links[0].url as Uri)).toBe(true);
    expect(second).toHaveBeenCalledWith('b.md');
    expect(first).not.toHaveBeenCalled();
    firstRegistration.dispose();
    expect(activeOpener.open(firstLinks.links[0].url as Uri)).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(disposeProvider).not.toHaveBeenCalled();
    secondRegistration.dispose();
    expect(disposeProvider).toHaveBeenCalledTimes(1);
    expect(disposeOpener).not.toHaveBeenCalled();
    expect(activeOpener.open(secondLinks.links[0].url as Uri)).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    const thirdRegistration = registerEditorLinkModel(firstModel.instance, first);
    expect(registerLinkOpener).toHaveBeenCalledTimes(1);
    thirdRegistration.dispose();
});

test('consumes unknown and malformed reserved URLs without external opening', () => {
    const registration = registerEditorLinkModel(model('plain').instance, jest.fn());
    expect(
        activeOpener.open({ scheme: 'https', authority: 'editor-link.gomarkedit.invalid', path: '/unknown/0' } as Uri),
    ).toBe(true);
    expect(
        activeOpener.open({ scheme: 'https', authority: 'editor-link.gomarkedit.invalid', path: '/unrelated' } as Uri),
    ).toBe(true);
    expect(activeOpener.open({ scheme: 'https', authority: 'example.org', path: '/normal' } as Uri)).toBe(false);
    expect(
        activeOpener.open({ scheme: 'https', authority: 'editor-link.gomarkedit.invalid:443', path: '/1/1/0' } as Uri),
    ).toBe(false);
    expect(
        activeOpener.open({ scheme: 'http', authority: 'editor-link.gomarkedit.invalid', path: '/1/1/0' } as Uri),
    ).toBe(false);
    registration.dispose();
});

test('ignores old replies for same-version supersession and caches successful empty results', async () => {
    const current = model('[go](first.md)');
    const registration = registerEditorLinkModel(current.instance, jest.fn());
    const first = request(current.instance);
    const second = request(current.instance);
    expect(pending[0].signal.aborted).toBe(true);
    pending[0].resolve({ kind: 'links', links: [link('stale.md')] });
    expect((await first).links).toEqual([]);
    pending[1].resolve({ kind: 'links', links: [] });
    expect((await second).links).toEqual([]);
    expect((await request(current.instance)).links).toEqual([]);
    expect(pending).toHaveLength(2);
    registration.dispose();
});

test('invalidates prior links when model version changes and rejects a late reply', async () => {
    const current = model('[go](first.md)');
    const activate = jest.fn();
    const registration = registerEditorLinkModel(current.instance, activate);
    const oldRequest = request(current.instance);
    pending[0].resolve({ kind: 'links', links: [link('first.md')] });
    const oldLink = (await oldRequest).links[0].url as Uri;
    current.set('[go](second.md)');
    expect(activeOpener.open(oldLink)).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    const nextRequest = request(current.instance);
    pending[1].resolve({ kind: 'links', links: [link('second.md')] });
    const nextLink = (await nextRequest).links[0].url as Uri;
    expect(activeOpener.open({ ...nextLink, query: 'changed=1' } as Uri)).toBe(true);
    expect(activeOpener.open({ ...nextLink, fragment: 'changed' } as Uri)).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    expect(activeOpener.open(nextLink)).toBe(true);
    expect(activate).toHaveBeenCalledWith('second.md');
    registration.dispose();
});

test('a model version changed during extraction cannot publish old links', async () => {
    const current = model('[go](first.md)');
    const activate = jest.fn();
    const registration = registerEditorLinkModel(current.instance, activate);
    const stale = request(current.instance);
    current.set('[go](second.md)');
    pending[0].resolve({ kind: 'links', links: [link('first.md')] });
    expect((await stale).links).toEqual([]);
    const fresh = request(current.instance);
    pending[1].resolve({ kind: 'links', links: [link('second.md')] });
    const freshLink = (await fresh).links[0].url as Uri;
    expect(activeOpener.open(freshLink)).toBe(true);
    expect(activate).toHaveBeenCalledWith('second.md');
    registration.dispose();
});

test('successful nonempty extraction is reused for the same version', async () => {
    const current = model('[go](first.md)');
    const activate = jest.fn();
    const registration = registerEditorLinkModel(current.instance, activate);
    const first = request(current.instance);
    pending[0].resolve({ kind: 'links', links: [link('first.md')] });
    const oldLink = (await first).links[0].url as Uri;
    const second = await request(current.instance);
    expect(pending).toHaveLength(1);
    expect(activeOpener.open(oldLink)).toBe(true);
    expect(activate).not.toHaveBeenCalled();
    expect(activeOpener.open(second.links[0].url as Uri)).toBe(true);
    expect(activate).toHaveBeenCalledWith('first.md');
    registration.dispose();
});

test('cancellation and disposal abort work and cannot publish late results', async () => {
    const current = model('[go](first.md)');
    const registration = registerEditorLinkModel(current.instance, jest.fn());
    const cancellation = cancellationToken();
    const cancelled = request(current.instance, cancellation.token);
    cancellation.cancel();
    expect(pending[0].signal.aborted).toBe(true);
    pending[0].resolve({ kind: 'links', links: [link('late.md')] });
    expect((await cancelled).links).toEqual([]);
    const disposing = request(current.instance);
    registration.dispose();
    expect(pending[1].signal.aborted).toBe(true);
    pending[1].resolve({ kind: 'links', links: [link('late.md')] });
    expect((await disposing).links).toEqual([]);
    expect((await request(current.instance)).links).toEqual([]);
});

test('new registration of the same model rejects its predecessor’s late result', async () => {
    const current = model('[go](first.md)');
    const oldActivate = jest.fn();
    const oldRegistration = registerEditorLinkModel(current.instance, oldActivate);
    const oldRequest = request(current.instance);
    oldRegistration.dispose();
    const newActivate = jest.fn();
    const newRegistration = registerEditorLinkModel(current.instance, newActivate);
    const freshRequest = request(current.instance);
    pending[0].resolve({ kind: 'links', links: [link('old.md')] });
    expect((await oldRequest).links).toEqual([]);
    pending[1].resolve({ kind: 'links', links: [link('new.md')] });
    const freshLink = (await freshRequest).links[0].url as Uri;
    expect(activeOpener.open(freshLink)).toBe(true);
    expect(newActivate).toHaveBeenCalledWith('new.md');
    expect(oldActivate).not.toHaveBeenCalled();
    newRegistration.dispose();
});

test('re-registering a model invalidates its prior URL and stops its prior extraction', async () => {
    const current = model('[go](first.md)');
    const oldActivate = jest.fn();
    const oldRegistration = registerEditorLinkModel(current.instance, oldActivate);
    const first = request(current.instance);
    pending[0].resolve({ kind: 'links', links: [link('first.md')] });
    const oldUrl = (await first).links[0].url as Uri;

    const newActivate = jest.fn();
    const newRegistration = registerEditorLinkModel(current.instance, newActivate);
    expect(activeOpener.open(oldUrl)).toBe(true);
    expect(oldActivate).not.toHaveBeenCalled();

    const inFlight = request(current.instance);
    const newestRegistration = registerEditorLinkModel(current.instance, jest.fn());
    expect(pending[1].signal.aborted).toBe(true);
    pending[1].resolve({ kind: 'links', links: [link('stale.md')] });
    expect((await inFlight).links).toEqual([]);
    oldRegistration.dispose();
    newRegistration.dispose();
    newestRegistration.dispose();
});

test('failed extraction does not cache failure as successful empty links', async () => {
    const current = model('no links');
    const registration = registerEditorLinkModel(current.instance, jest.fn());
    const first = request(current.instance);
    pending[0].resolve({ kind: 'failed' });
    expect((await first).links).toEqual([]);
    const second = request(current.instance);
    expect(pending).toHaveLength(2);
    pending[1].resolve({ kind: 'links', links: [] });
    expect((await second).links).toEqual([]);
    registration.dispose();
});
