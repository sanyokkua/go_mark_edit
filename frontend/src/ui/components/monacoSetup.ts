import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/browser/coreCommands';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

import { observeRootTheme, registerGeneratedThemes } from './monacoThemes';

self.MonacoEnvironment = {
  getWorker(): Worker {
    return new EditorWorker();
  },
};

export function applyMonacoThemeFromRoot(): () => void {
  registerGeneratedThemes({
    defineTheme(name, definition): void {
      monaco.editor.defineTheme(name, {
        ...definition,
        colors: { ...definition.colors },
        rules: definition.rules.map((rule) => ({ ...rule })),
      });
    },
    setTheme(name): void {
      monaco.editor.setTheme(name);
    },
  });
  return observeRootTheme(document.documentElement, monaco.editor);
}

export { monaco };
