import type {
  EditorSettings,
  MarkdownSettings,
  Settings,
} from '../adapter/settingsTypes';
import settingsReducer, {
  acknowledgeEditorSettings,
  acknowledgeMarkdownSettings,
  hydrateSettings,
  initialSettingsState,
  resetSettingsProjection,
} from './settingsSlice';

const settings: Settings = {
  appearance: { theme: 'minimal', mode: 'dark', defaultOpenMode: 'editor' },
  markdown: {
    standard: 'gfm',
    formatOnSave: false,
    lintOnSave: false,
    bulletMarker: '*',
    emphasisMarker: '_',
    headingStyle: 'atx',
  },
  contentPrivacy: { remotePolicy: 'ask' },
  editor: { lineNumbers: false, wordWrap: true, fontSize: 16 },
};

it('T054 hydrates acknowledged editor and Markdown settings into Redux projection', () => {
  const state = settingsReducer(undefined, hydrateSettings(settings));

  expect(state).toMatchObject({
    hydrated: true,
    editor: settings.editor,
    markdown: settings.markdown,
  });
});

it('T054 keeps the last acknowledged values until an adapter write is acknowledged', () => {
  const initial = settingsReducer(undefined, hydrateSettings(settings));
  const editor: EditorSettings = {
    lineNumbers: true,
    wordWrap: false,
    fontSize: 13,
  };
  const markdown: MarkdownSettings = {
    ...settings.markdown,
    bulletMarker: '+',
  };

  const editorState = settingsReducer(
    initial,
    acknowledgeEditorSettings(editor),
  );
  const markdownState = settingsReducer(
    editorState,
    acknowledgeMarkdownSettings(markdown),
  );

  expect(markdownState.editor).toEqual(editor);
  expect(markdownState.markdown).toEqual(markdown);
  expect(settingsReducer(markdownState, resetSettingsProjection())).toEqual(
    initialSettingsState,
  );
});
