import { resolveMermaidTheme } from '../../../../src/logic/markdown/mermaid/theme';

it('captures concrete rgb colours and dark mode before a later root-theme change', () => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'material');
    root.setAttribute('data-mode', 'light');
    const colors: Record<string, string> = {
        '--surface': 'rgb(255, 255, 255)',
        '--surface-raised': 'rgb(245, 245, 245)',
        '--text': 'rgb(20, 21, 22)',
        '--accent': 'rgb(10, 20, 30)',
        '--border': 'rgb(30, 40, 50)',
        '--accent-ink': 'rgb(11, 12, 13)',
    };
    const getComputed = jest.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
        const value = (element as HTMLElement).style.color;
        const token = value.match(/var\((--[^)]+)\)/)?.[1];
        return { color: colors[token ?? ''] ?? 'rgb(0, 0, 0)' } as CSSStyleDeclaration;
    });
    const first = JSON.parse(resolveMermaidTheme());
    root.setAttribute('data-mode', 'dark');
    colors['--accent'] = 'rgb(200, 210, 220)';
    const second = JSON.parse(resolveMermaidTheme());
    getComputed.mockRestore();
    expect(first.darkMode).toBe(false);
    expect(first.themeVariables.primaryColor).toMatch(/^rgb\(/);
    expect(first.themeVariables.primaryBorderColor).toBe('rgb(10, 20, 30)');
    expect(second.darkMode).toBe(true);
    expect(second.themeVariables.primaryBorderColor).toBe('rgb(200, 210, 220)');
    expect(first).not.toEqual(second);
});

it('uses the elevated opaque surface for diagram nodes when the preview surface is translucent', () => {
    const colors: Record<string, string> = {
        '--surface': 'rgb(255, 255, 255)',
        '--elevated': 'rgb(28, 30, 54)',
        '--surface-raised': 'rgb(30, 39, 76)',
        '--text': 'rgb(234, 240, 255)',
        '--accent': 'rgb(120, 150, 240)',
        '--border': 'rgb(80, 90, 120)',
    };
    const getComputed = jest.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
        const token = (element as HTMLElement).style.color.match(/var\((--[^)]+)\)/)?.[1];
        return { color: colors[token ?? ''] ?? 'rgb(0, 0, 0)' } as CSSStyleDeclaration;
    });
    try {
        const { themeVariables } = JSON.parse(resolveMermaidTheme()) as { themeVariables: Record<string, string> };
        expect(themeVariables.primaryColor).toBe('rgb(28, 30, 54)');
        expect(themeVariables.mainBkg).toBe('rgb(28, 30, 54)');
        expect(themeVariables.actorBkg).toBe('rgb(28, 30, 54)');
        expect(themeVariables.tertiaryColor).toBe('rgb(28, 30, 54)');
    } finally {
        getComputed.mockRestore();
    }
});

it('uses the muted content color for diagram connections and cluster outlines', () => {
    const colors: Record<string, string> = {
        '--elevated': 'rgb(36, 36, 46)',
        '--surface-raised': 'rgb(36, 36, 46)',
        '--text': 'rgb(230, 230, 238)',
        '--accent': 'rgb(179, 194, 255)',
        '--border': 'rgb(51, 51, 63)',
        '--muted': 'rgb(168, 168, 182)',
    };
    const getComputed = jest.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
        const token = (element as HTMLElement).style.color.match(/var\((--[^)]+)\)/)?.[1];
        return { color: colors[token ?? ''] ?? 'rgb(0, 0, 0)' } as CSSStyleDeclaration;
    });
    try {
        const { themeVariables } = JSON.parse(resolveMermaidTheme()) as { themeVariables: Record<string, string> };
        expect(themeVariables.lineColor).toBe(colors['--muted']);
        expect(themeVariables.clusterBorder).toBe(colors['--muted']);
    } finally {
        getComputed.mockRestore();
    }
});
