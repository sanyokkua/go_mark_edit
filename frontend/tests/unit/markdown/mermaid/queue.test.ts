import { MermaidQueue } from '../../../../src/logic/markdown/mermaid/queue';

const initialize = jest.fn();
const parse = jest.fn();
const render = jest.fn();

jest.mock('mermaid', () => ({
    __esModule: true,
    default: { initialize, parse, render },
}));

const theme = JSON.stringify({ darkMode: false, themeVariables: { primaryColor: 'rgb(1, 2, 3)' } });

function request(source: string, signal = new AbortController().signal) {
    return { source, theme, signal };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

beforeEach(() => {
    document.body.innerHTML = '';
    initialize.mockReset();
    parse.mockReset().mockResolvedValue(true);
    render.mockReset().mockImplementation(async (id: string) => ({ svg: `<svg id="${id}"></svg>` }));
});

it('serializes initialization and rendering and captures each request theme', async () => {
    const first = deferred<{ svg: string }>();
    render.mockImplementationOnce(() => first.promise);
    const queue = new MermaidQueue();
    const secondTheme = JSON.stringify({ darkMode: true, themeVariables: { primaryColor: 'rgb(4, 5, 6)' } });
    const firstResult = queue.render(request('graph TD; A-->B'));
    const secondResult = queue.render({
        source: 'graph TD; C-->D',
        theme: secondTheme,
        signal: new AbortController().signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    first.resolve({ svg: '<svg id="first"></svg>' });
    await firstResult;
    await secondResult;
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(initialize.mock.calls[0][0]).toMatchObject({
        darkMode: false,
        themeVariables: { primaryColor: 'rgb(1, 2, 3)' },
    });
    expect(initialize.mock.calls[1][0]).toMatchObject({
        darkMode: true,
        themeVariables: { primaryColor: 'rgb(4, 5, 6)' },
    });
    expect(render.mock.calls[0][0]).toMatch(/^gme-mmd-\d+$/);
    expect(render.mock.calls[1][0]).toMatch(/^gme-mmd-\d+$/);
    expect(render.mock.calls[1][0]).not.toBe(render.mock.calls[0][0]);
});

it('aborts one coalesced subscriber while completing another with one render', async () => {
    const pending = deferred<{ svg: string }>();
    render.mockImplementation(() => pending.promise);
    const queue = new MermaidQueue();
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();
    const first = queue.render(request('graph TD; A-->B', firstAbort.signal));
    const second = queue.render(request('graph TD; A-->B', secondAbort.signal));
    firstAbort.abort();
    expect(await first).toEqual({ kind: 'aborted' });
    pending.resolve({ svg: '<svg id="shared"></svg>' });
    expect(await second).toMatchObject({ kind: 'svg', svg: expect.stringContaining('id="shared"') });
    expect(render).toHaveBeenCalledTimes(1);
});

it('skips queued work when all subscribers abort before it starts', async () => {
    const first = deferred<{ svg: string }>();
    render.mockImplementationOnce(() => first.promise);
    const queue = new MermaidQueue();
    const running = queue.render(request('graph TD; A-->B'));
    const controller = new AbortController();
    const skipped = queue.render(request('graph TD; C-->D', controller.signal));
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    expect(await skipped).toEqual({ kind: 'aborted' });
    first.resolve({ svg: '<svg/>' });
    await running;
    expect(render).toHaveBeenCalledTimes(1);
});

it('removes Mermaid temporary elements after success and render failure', async () => {
    const queue = new MermaidQueue();
    render.mockImplementationOnce(async (id: string) => {
        document.body.insertAdjacentHTML('beforeend', `<div id="${id}"></div><div id="d${id}"></div>`);
        return { svg: '<svg/>' };
    });
    expect((await queue.render(request('graph TD; A-->B'))).kind).toBe('svg');
    expect(document.querySelector('[id^="gme-mmd-"]')).toBeNull();
    expect(document.querySelector('[id^="dgme-mmd-"]')).toBeNull();

    render.mockImplementationOnce(async (id: string) => {
        document.body.insertAdjacentHTML('beforeend', `<div id="${id}"></div><div id="d${id}"></div>`);
        throw new Error('line 2: exact render error');
    });
    expect(await queue.render(request('broken'))).toEqual({ kind: 'error', message: 'line 2: exact render error' });
    expect(document.querySelector('[id^="gme-mmd-"]')).toBeNull();
    expect(document.querySelector('[id^="dgme-mmd-"]')).toBeNull();
});

it('preserves exact render and non-Error rejection messages', async () => {
    const queue = new MermaidQueue();
    render.mockRejectedValueOnce(new Error('  maxEdges exceeded\nnext line'));
    expect(await queue.render(request('edges'))).toEqual({ kind: 'error', message: '  maxEdges exceeded\nnext line' });
    parse.mockRejectedValueOnce({ message: 'plain rejection' });
    expect(await queue.render(request('bad parse'))).toEqual({ kind: 'error', message: 'plain rejection' });
});

it('keeps only fifty successful entries and promotes a cache hit before eviction', async () => {
    const queue = new MermaidQueue();
    for (let index = 0; index < 50; index += 1) await queue.render(request(`graph TD; A${index}-->B`));
    expect(render).toHaveBeenCalledTimes(50);
    await queue.render(request('graph TD; A0-->B'));
    expect(render).toHaveBeenCalledTimes(50);
    await queue.render(request('graph TD; A50-->B'));
    await queue.render(request('graph TD; A1-->B'));
    expect(render).toHaveBeenCalledTimes(52);
    await queue.render(request('graph TD; A0-->B'));
    expect(render).toHaveBeenCalledTimes(52);
});

it('passes strict configuration and rejects directives that try to change secure values', async () => {
    const queue = new MermaidQueue();
    await queue.render(request('%%{init: {"theme":"dark"}}%%\ngraph TD; A-->B'));
    const config = initialize.mock.calls[0][0];
    expect(config).toMatchObject({
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        suppressErrorRendering: true,
        theme: 'base',
        maxTextSize: 50000,
        maxEdges: 500,
        logLevel: 'fatal',
    });
    expect(config.secure).toEqual(
        expect.arrayContaining([
            'secure',
            'securityLevel',
            'startOnLoad',
            'maxTextSize',
            'suppressErrorRendering',
            'maxEdges',
            'theme',
            'themeVariables',
            'themeCSS',
            'look',
            'layout',
            'fontFamily',
            'altFontFamily',
            'fontSize',
            'htmlLabels',
            'flowchart',
            'sequence',
            'logLevel',
            'deterministicIds',
            'deterministicIDSeed',
            'dompurifyConfig',
            'handDrawnSeed',
            'elk',
            'darkMode',
            'markdownAutoWrap',
            'wrap',
        ]),
    );
});
