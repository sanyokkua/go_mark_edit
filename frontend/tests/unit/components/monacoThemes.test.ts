import { generatedEditorThemes } from '../../../src/logic/theme/generatedEditorThemes';
import { observeRootTheme, registerGeneratedThemes, themeNameFromRoot } from '../../../src/ui/components/monacoThemes';

type ThemeEngine = {
    defineTheme: jest.Mock;
    setTheme: jest.Mock;
};

function engine(): ThemeEngine {
    return { defineTheme: jest.fn(), setTheme: jest.fn() };
}

it('registers each generated Monaco theme exactly once', (): void => {
    const target = engine();
    registerGeneratedThemes(target);
    registerGeneratedThemes(target);

    expect(target.defineTheme).toHaveBeenCalledTimes(Object.keys(generatedEditorThemes).length);
    expect(target.defineTheme).toHaveBeenCalledWith('gme-material-light', generatedEditorThemes['gme-material-light']);
});

it('derives a valid theme name and falls back to Material light', (): void => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'glass');
    root.setAttribute('data-mode', 'dark');
    expect(themeNameFromRoot(root)).toBe('gme-glass-dark');

    root.setAttribute('data-theme', 'unknown');
    root.setAttribute('data-mode', 'auto');
    expect(themeNameFromRoot(root)).toBe('gme-material-light');
});

it('observes only root palette attributes and disposes cleanly', async (): Promise<void> => {
    const target = engine();
    const root = document.documentElement;
    root.setAttribute('data-theme', 'material');
    root.setAttribute('data-mode', 'light');
    const dispose = observeRootTheme(root, target);

    expect(target.setTheme).toHaveBeenLastCalledWith('gme-material-light');
    root.setAttribute('data-theme', 'minimal');
    root.setAttribute('data-mode', 'dark');
    await Promise.resolve();
    expect(target.setTheme).toHaveBeenLastCalledWith('gme-minimal-dark');

    dispose();
    root.setAttribute('data-theme', 'glass');
    await Promise.resolve();
    expect(target.setTheme).toHaveBeenCalledTimes(2);
});

it('notifies a mounted editor after applying each root palette', async (): Promise<void> => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'material');
    root.setAttribute('data-mode', 'light');
    const order: string[] = [];
    const target = {
        setTheme: (name: string): void => {
            order.push(`theme:${name}`);
        },
    };
    const repaint = (): void => {
        order.push('repaint');
    };

    const dispose = observeRootTheme(root, target, repaint);
    expect(order).toEqual(['theme:gme-material-light', 'repaint']);

    root.setAttribute('data-mode', 'dark');
    await Promise.resolve();
    expect(order).toEqual(['theme:gme-material-light', 'repaint', 'theme:gme-material-dark', 'repaint']);

    dispose();
    root.setAttribute('data-theme', 'glass');
    await Promise.resolve();
    expect(order).toHaveLength(4);
});
