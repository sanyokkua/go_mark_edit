(() => {
  const fallback = { theme: 'material', mode: 'auto' };
  let mirror = fallback;
  try {
    const parsed = JSON.parse(
      globalThis.localStorage.getItem('gme.theme') || 'null',
    );
    const validTheme =
      parsed &&
      parsed.version === 1 &&
      ['glass', 'material', 'minimal'].includes(parsed.theme);
    const validMode = parsed && ['auto', 'light', 'dark'].includes(parsed.mode);
    if (validTheme && validMode)
      mirror = { theme: parsed.theme, mode: parsed.mode };
  } catch {
    mirror = fallback;
  }
  const mode =
    mirror.mode === 'auto' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : mirror.mode === 'auto'
        ? 'light'
        : mirror.mode;
  globalThis.document.documentElement.setAttribute('data-theme', mirror.theme);
  globalThis.document.documentElement.setAttribute('data-mode', mode);
})();
