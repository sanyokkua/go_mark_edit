import { actionRegistry, getAction, getActionAvailability } from '../../../src/logic/actions/actionRegistry';

it('keeps the canonical action catalogue stable', () => {
    expect(actionRegistry.map(({ id }) => id)).toEqual([
        'new-file',
        'new-window',
        'open-file',
        'open-folder',
        'close-folder',
        'open-recent',
        'clear-recent',
        'reopen',
        'save',
        'save-as',
        'export-pdf',
        'close-tab',
        'close-others',
        'close-right',
        'move-tab-left',
        'move-tab-right',
        'new-file-here',
        'new-folder-here',
        'copy-path',
        'reveal-in-file-manager',
        'exit',
        'settings',
        'appearance',
        'editor-settings',
        'default-open-mode',
        'reading-width',
        'pdf-appearance',
        'markdown-standard',
        'autosave',
        'format-on-save',
        'lint-on-save',
        'all-settings',
        'view',
        'editor',
        'split',
        'preview',
        'refresh-preview',
        'preview-copy',
        'preview-select-all',
        'toggle-sidebar',
        'toggle-problems',
        'toggle-assistant',
        'line-numbers',
        'word-wrap',
        'scroll-sync',
        'distraction-free-reading',
        'fullscreen',
        'keyboard-shortcuts',
        'open-logs',
        'view-github',
        'about',
        'find',
        'replace',
        'bold',
        'italic',
        'bold-italic',
        'strike',
        'inline-code',
        'heading-1',
        'heading-2',
        'heading-3',
        'heading-4',
        'heading-5',
        'heading-6',
        'bullet-list',
        'numbered-list',
        'task-list',
        'quote',
        'link',
        'image',
        'table',
        'format',
        'compact',
        'lint',
        'cut',
        'copy',
        'paste',
        'paste-plain',
        'command-palette',
        'next-tab',
        'previous-tab',
    ]);
});

it('gives synchronized scrolling no keyboard shortcut', () => {
    expect(getAction('scroll-sync').shortcut).toBeUndefined();
});

it('answers every surface from the same projected availability policy', () => {
    const projection = {
        activeDocumentId: 'doc-1',
        orderedDocumentIds: ['doc-1'],
        documents: { 'doc-1': { capability: 'unsafe-read-only' } },
    };

    expect(
        getActionAvailability('save', {
            documentId: 'doc-1',
            projectedState: projection,
        }),
    ).toEqual({ kind: 'unavailable', reason: 'no-document' });
    expect(getActionAvailability('bold', { projectedState: projection })).toEqual({
        kind: 'unavailable',
        reason: 'no-document',
    });
    expect(getActionAvailability('toggle-assistant', { projectedState: projection })).toEqual({
        kind: 'unavailable',
        reason: 'deferred',
    });
    expect(
        getActionAvailability('format-on-save', { markdownSettingsLoaded: false, projectedState: projection }),
    ).toEqual({
        kind: 'unavailable',
        reason: 'settings-loading',
    });
    expect(
        getActionAvailability('format-on-save', { markdownSettingsLoaded: true, projectedState: projection }),
    ).toEqual({ kind: 'available' });
});
