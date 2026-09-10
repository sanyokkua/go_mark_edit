import {
  actionRegistry,
  getActionAvailability,
} from '../../../src/logic/actions/actionRegistry';

it('keeps the canonical action catalogue stable', () => {
  expect(actionRegistry.map(({ id }) => id)).toEqual([
    'new-file',
    'new-window',
    'open-file',
    'open-folder',
    'open-recent',
    'reopen',
    'save',
    'save-as',
    'export-pdf',
    'close-tab',
    'close-others',
    'close-right',
    'move-tab-left',
    'move-tab-right',
    'copy-path',
    'reveal-in-file-manager',
    'exit',
    'settings',
    'appearance',
    'editor-settings',
    'default-open-mode',
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
    'toggle-sidebar',
    'toggle-assistant',
    'line-numbers',
    'word-wrap',
    'distraction-free-reading',
    'fullscreen',
    'keyboard-shortcuts',
    'open-logs',
    'view-github',
    'about',
    'bold',
    'italic',
    'strike',
    'inline-code',
    'heading-1',
    'heading-2',
    'heading-3',
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
  expect(getActionAvailability('bold', { projectedState: projection })).toEqual(
    { kind: 'unavailable', reason: 'no-document' },
  );
  expect(
    getActionAvailability('toggle-assistant', { projectedState: projection }),
  ).toEqual({ kind: 'unavailable', reason: 'deferred' });
  expect(
    getActionAvailability('format-on-save', { projectedState: projection }),
  ).toEqual({ kind: 'unavailable', reason: 'deferred' });
});
