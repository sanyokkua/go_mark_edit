import type { EditorSettings, MarkdownSettings, Settings } from '../../../src/logic/adapter/settingsTypes';
import settingsReducer, {
    acknowledgeEditorSettings,
    acknowledgeMarkdownSettings,
    hydrateSettings,
    initialSettingsState,
    readingWidthAcknowledged,
    resetSettingsProjection,
} from '../../../src/logic/store/settingsSlice';

const settings: Settings = {
    appearance: { theme: 'minimal', mode: 'dark', defaultOpenMode: 'editor', readingWidth: 'page' },
    markdown: {
        standard: 'gfm',
        formatOnSave: false,
        lintOnSave: false,
        bulletMarker: '*',
        emphasisMarker: '_',
        headingStyle: 'atx',
    },
    contentPrivacy: { remotePolicy: 'ask' },
    editor: { lineNumbers: false, wordWrap: true, scrollSync: false, fontSize: 16 },
    file: { autosave: false },
};

it('hydrates acknowledged editor and Markdown settings into Redux projection', () => {
    const state = settingsReducer(undefined, hydrateSettings(settings));

    expect(state).toMatchObject({
        hydrated: true,
        editor: settings.editor,
        markdown: settings.markdown,
        file: settings.file,
    });
});

it('defaults synchronized scrolling on until settings hydrate', () => {
    expect(initialSettingsState.editor.scrollSync).toBe(true);
});

it('keeps Markdown settings absent until hydration and after reset', () => {
    expect(settingsReducer(undefined, { type: 'unrelated' }).markdown).toBeUndefined();
    const loaded = settingsReducer(undefined, hydrateSettings(settings));
    expect(settingsReducer(loaded, resetSettingsProjection()).markdown).toBeUndefined();
});

it('keeps the last acknowledged values until an adapter write is acknowledged', () => {
    const initial = settingsReducer(undefined, hydrateSettings(settings));
    const editor: EditorSettings = {
        lineNumbers: true,
        wordWrap: false,
        scrollSync: true,
        fontSize: 13,
    };
    const markdown: MarkdownSettings = {
        ...settings.markdown,
        bulletMarker: '+',
    };

    const editorState = settingsReducer(initial, acknowledgeEditorSettings(editor));
    const markdownState = settingsReducer(editorState, acknowledgeMarkdownSettings(markdown));

    expect(markdownState.editor).toEqual(editor);
    expect(markdownState.markdown).toEqual(markdown);
    expect(settingsReducer(markdownState, resetSettingsProjection())).toEqual(initialSettingsState);
});

it('projects the stored reading width, reading anything but full as page', () => {
    const withWidth = (readingWidth: string): Settings => ({
        ...settings,
        appearance: { ...settings.appearance, readingWidth },
    });
    expect(initialSettingsState.readingWidth).toBe('page');
    expect(settingsReducer(undefined, hydrateSettings(withWidth('full'))).readingWidth).toBe('full');
    expect(settingsReducer(undefined, hydrateSettings(withWidth('page'))).readingWidth).toBe('page');
    expect(settingsReducer(undefined, hydrateSettings(withWidth('wide'))).readingWidth).toBe('page');
    const missing = { ...settings, appearance: { theme: 'minimal', mode: 'dark', defaultOpenMode: 'editor' } };
    expect(settingsReducer(undefined, hydrateSettings(missing as Settings)).readingWidth).toBe('page');
});

it('replaces the reading width when the write is acknowledged and clears it on reset', () => {
    const loaded = settingsReducer(undefined, hydrateSettings(settings));
    const full = settingsReducer(loaded, readingWidthAcknowledged('full'));
    expect(full.readingWidth).toBe('full');
    expect(settingsReducer(full, readingWidthAcknowledged('page')).readingWidth).toBe('page');
    expect(settingsReducer(full, resetSettingsProjection()).readingWidth).toBe('page');
});
