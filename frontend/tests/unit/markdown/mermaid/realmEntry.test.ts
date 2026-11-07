afterEach(() => {
    delete window.__gmeMermaidRealmReady;
    jest.resetModules();
    jest.dontMock('mermaid');
});

it('publishes readiness during module evaluation and delegates to Mermaid', async () => {
    const mermaid = { initialize: jest.fn(), parse: jest.fn(), render: jest.fn() };
    jest.doMock('mermaid', () => ({ __esModule: true, default: mermaid }));
    jest.isolateModules(() => {
        jest.requireActual('../../../../src/logic/markdown/mermaid/realmEntry');
        expect(window.__gmeMermaidRealmReady).toBeInstanceOf(Promise);
    });
    const realm = await window.__gmeMermaidRealmReady!;
    realm.initialize({ startOnLoad: false });
    expect(mermaid.initialize).toHaveBeenCalledWith({ startOnLoad: false });
    realm.parse('graph TD');
    realm.render('diagram', 'graph TD');
    expect(mermaid.parse).toHaveBeenCalledWith('graph TD');
    expect(mermaid.render).toHaveBeenCalledWith('diagram', 'graph TD');
    document.body.innerHTML = '<div id="diagram"></div><div id="ddiagram"></div>';
    realm.cleanup('diagram');
    expect(document.body.children).toHaveLength(0);
});

it('rejects readiness with the Mermaid import failure', async () => {
    const failure = new Error('Mermaid import failed');
    jest.doMock('mermaid', () => {
        throw failure;
    });
    jest.isolateModules(() => {
        jest.requireActual('../../../../src/logic/markdown/mermaid/realmEntry');
        expect(window.__gmeMermaidRealmReady).toBeInstanceOf(Promise);
    });
    await expect(window.__gmeMermaidRealmReady).rejects.toBe(failure);
});
