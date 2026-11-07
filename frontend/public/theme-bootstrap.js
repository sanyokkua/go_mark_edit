(() => {
    const fallback = { theme: 'material', mode: 'auto' };
    let mirror = fallback;
    try {
        const parsed = JSON.parse(globalThis.localStorage.getItem('gme.theme') || 'null');
        if (
            parsed?.version === 1 &&
            ['glass', 'material', 'minimal'].includes(parsed.theme) &&
            ['auto', 'light', 'dark'].includes(parsed.mode)
        ) {
            mirror = { theme: parsed.theme, mode: parsed.mode };
        }
    } catch {
        mirror = fallback;
    }
    let mode = mirror.mode;
    if (mode === 'auto') {
        mode = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    const { dataset } = globalThis.document.documentElement;
    dataset.theme = mirror.theme;
    dataset.mode = mode;
})();
