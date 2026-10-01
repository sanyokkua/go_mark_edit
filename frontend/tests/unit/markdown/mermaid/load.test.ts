import { MermaidQueue } from '../../../../src/logic/markdown/mermaid/queue';

const theme = JSON.stringify({ darkMode: false, themeVariables: { primaryColor: 'rgb(1, 2, 3)' } });

it('retries a failed lazy Mermaid import once and then renders successfully', async () => {
    let attempts = 0;
    jest.doMock('mermaid', () => {
        attempts += 1;
        if (attempts === 1) throw new Error('first chunk failure');
        return {
            __esModule: true,
            default: {
                initialize: jest.fn(),
                parse: jest.fn().mockResolvedValue(true),
                render: jest.fn().mockResolvedValue({ svg: '<svg/>' }),
            },
        };
    });
    const result = await new MermaidQueue().render({
        source: 'graph TD; A-->B',
        theme,
        signal: new AbortController().signal,
    });
    expect(result.kind).toBe('svg');
    expect(attempts).toBe(2);
});

it('returns the exact second import error as a distinct load failure', async () => {
    jest.resetModules();
    let attempts = 0;
    jest.doMock('mermaid', () => {
        attempts += 1;
        throw new Error('second chunk failure');
    });
    const result = await new MermaidQueue().render({
        source: 'graph TD; A-->B',
        theme,
        signal: new AbortController().signal,
    });
    expect(result).toEqual({ kind: 'error', stage: 'load', message: 'second chunk failure' });
    expect(attempts).toBe(2);
});
