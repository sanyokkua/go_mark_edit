import type { Settings } from '../../src/logic/adapter/settingsTypes';

export const loadedMarkdownSettings: Settings = {
    appearance: { defaultOpenMode: 'editor', readingWidth: 'page', mode: 'auto', theme: 'material' },
    contentPrivacy: { remotePolicy: 'ask' },
    editor: { fontSize: 14, lineNumbers: true, scrollSync: true, wordWrap: false },
    file: { autosave: true },
    markdown: {
        bulletMarker: '-',
        emphasisMarker: '_',
        formatOnSave: false,
        headingStyle: 'atx',
        lintOnSave: true,
        standard: 'full',
    },
};
