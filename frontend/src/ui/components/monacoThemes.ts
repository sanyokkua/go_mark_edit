import { generatedEditorThemes } from '../../logic/theme/generatedEditorThemes';

type ThemeName = keyof typeof generatedEditorThemes;

export interface MonacoThemeEngine {
  defineTheme(
    name: string,
    data: (typeof generatedEditorThemes)[ThemeName],
  ): void;
  setTheme(name: string): void;
}

let registered = false;

export function registerGeneratedThemes(engine: MonacoThemeEngine): void {
  if (registered) return;
  for (const [name, definition] of Object.entries(generatedEditorThemes)) {
    engine.defineTheme(name, definition);
  }
  registered = true;
}

export function themeNameFromRoot(root: Element): ThemeName {
  const theme = root.getAttribute('data-theme');
  const mode = root.getAttribute('data-mode');
  const candidate = `gme-${theme}-${mode}` as ThemeName;
  return candidate in generatedEditorThemes ? candidate : 'gme-material-light';
}

export function observeRootTheme(
  root: Element,
  engine: Pick<MonacoThemeEngine, 'setTheme'>,
): () => void {
  const apply = (): void => engine.setTheme(themeNameFromRoot(root));
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-mode'],
  });
  return (): void => observer.disconnect();
}
