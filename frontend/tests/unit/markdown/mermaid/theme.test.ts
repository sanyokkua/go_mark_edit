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
    const first = JSON.parse(resolveMermaidTheme(document.body));
    root.setAttribute('data-mode', 'dark');
    colors['--accent'] = 'rgb(200, 210, 220)';
    const second = JSON.parse(resolveMermaidTheme(document.body));
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
        const { themeVariables } = JSON.parse(resolveMermaidTheme(document.body)) as {
            themeVariables: Record<string, string>;
        };
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
        const { themeVariables } = JSON.parse(resolveMermaidTheme(document.body)) as {
            themeVariables: Record<string, string>;
        };
        expect(themeVariables.lineColor).toBe(colors['--muted']);
        expect(themeVariables.clusterBorder).toBe(colors['--muted']);
    } finally {
        getComputed.mockRestore();
    }
});

it('resolves the light palette inside a Clean print copy while the root is dark', () => {
    const root = document.documentElement;
    root.setAttribute('data-mode', 'dark');
    const copy = document.createElement('div');
    copy.setAttribute('data-print-appearance', 'clean');
    const styled = document.createElement('div');
    styled.setAttribute('data-print-appearance', 'styled');
    document.body.append(copy, styled);
    const getComputed = jest.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
        const clean = element.closest("[data-print-appearance='clean']") !== null;
        const token = (element as HTMLElement).style.color.match(/var\((--[^)]+)\)/)?.[1];
        const colors: Record<string, string> = clean
            ? { '--elevated': 'rgb(243, 241, 251)', '--text': 'rgb(27, 27, 34)' }
            : { '--elevated': 'rgb(36, 36, 46)', '--text': 'rgb(230, 230, 238)' };
        return { color: colors[token ?? ''] ?? 'rgb(0, 0, 0)' } as CSSStyleDeclaration;
    });
    try {
        const inside = JSON.parse(resolveMermaidTheme(copy)) as {
            darkMode: boolean;
            themeVariables: Record<string, string>;
        };
        const onScreen = JSON.parse(resolveMermaidTheme(styled)) as typeof inside;
        expect(inside.darkMode).toBe(false);
        expect(inside.themeVariables.primaryColor).toBe('rgb(243, 241, 251)');
        expect(inside.themeVariables.textColor).toBe('rgb(27, 27, 34)');
        expect(onScreen.darkMode).toBe(true);
        expect(onScreen.themeVariables.primaryColor).toBe('rgb(36, 36, 46)');
        expect(copy.childElementCount).toBe(0);
    } finally {
        getComputed.mockRestore();
        copy.remove();
        styled.remove();
        root.removeAttribute('data-mode');
    }
});
