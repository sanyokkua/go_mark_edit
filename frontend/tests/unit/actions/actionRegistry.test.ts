import { t } from '../../../src/i18n';
import {
  actionRegistry,
  actionsForSurface,
  getActionAvailability,
  getAction,
  type ActionId,
} from '../../../src/logic/actions/actionRegistry';

// tolerance is proved by the two cases at the end of Menubar.test.tsx)
it('exposes one localized registry entry for every Editor-stage identity', () => {
  const ids = actionRegistry.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);

  for (const entry of actionRegistry) {
    expect(t(entry.labelKey)).not.toBe(entry.labelKey);
    expect(t(entry.accessibilityKey)).not.toBe(entry.accessibilityKey);
    expect(entry.surfaces.length).toBeGreaterThan(0);
    expect(entry.availability).toMatchObject({ kind: expect.any(String) });
  }

  expect(getAction('toggle-assistant')).toBe(
    getAction('toggle-assistant' as ActionId),
  );
  expect(getAction('toggle-assistant').availability.kind).toBe('deferred');
  expect(getAction('format').availability.kind).toBe('deferred');
  expect(getAction('command-palette').availability.kind).toBe('deferred');
  expect(getAction('bold').shortcut).toBe('Mod+B');
  expect(getAction('new-file').availability.kind).toBe('available');
  expect(getAction('open-file').availability.kind).toBe('available');
  expect(getAction('autosave').availability.kind).toBe('available');
  expect(getAction('refresh-preview').shortcut).toBeUndefined();
  expect(getAction('refresh-preview').surfaces).toContain('preview');
});

it('keeps required surface membership and omits deferred actions from native clipboard ownership', () => {
  expect(getAction('bold').surfaces).toEqual(
    expect.arrayContaining(['toolbar', 'context', 'shortcuts']),
  );
  expect(getAction('heading-1').surfaces).toEqual(
    expect.arrayContaining(['toolbar', 'shortcuts']),
  );
  expect(getAction('lint').surfaces).not.toContain('context');
  expect(getAction('paste').nativeRole).toBe('clipboard');
  expect(getAction('bold').nativeRole).toBe('none');
});

it('makes Save and Save As available document actions in the File menu', () => {
  expect(getAction('save').availability.kind).toBe('available');
  expect(getAction('save-as').availability.kind).toBe('available');
  expect(getAction('save').scope).toBe('document');
  expect(getAction('save-as').scope).toBe('document');
});

it('exposes the exact canonical file and tab shortcut inventory', () => {
  expect(getAction('new-file').shortcut).toBe('Mod+N');
  expect(getAction('open-file').shortcut).toBe('Mod+O');
  expect(getAction('save').shortcut).toBe('Mod+S');
  expect(getAction('save-as').shortcut).toBe('Mod+Shift+S');
  expect(getAction('close-tab').shortcut).toBe('Mod+W');
  expect(getAction('reopen').shortcut).toBe('Mod+Shift+Alt+T');
  expect(getAction('move-tab-left').shortcut).toBe('Mod+Shift+PageUp');
  expect(getAction('move-tab-right').shortcut).toBe('Mod+Shift+PageDown');
  expect(getAction('next-tab').shortcut).toBe('Mod+Tab');
  expect(getAction('previous-tab').shortcut).toBe('Mod+Shift+Tab');
  expect(getAction('table').shortcut).toBe('Mod+Shift+T');
  expect(getAction('refresh-preview').shortcut).toBeUndefined();
  expect(actionRegistry.some(({ id }) => /^tab-[0-9]+$/.test(id))).toBe(false);
});

it('derives lifecycle availability from projected capability and limits', () => {
  const projectedState = {
    activeDocumentId: 'doc-1',
    orderedDocumentIds: ['doc-1', 'doc-2'],
    documents: {
      'doc-1': { capability: 'writable' },
      'doc-2': { capability: 'read-only' },
    },
    canReopenLastFile: true,
  };

  expect(
    getActionAvailability('new-file', { projectedState, tabLimit: 40 }),
  ).toEqual({ kind: 'available' });
  expect(
    getActionAvailability('save', { projectedState, documentId: 'doc-1' }),
  ).toEqual({ kind: 'available' });
  expect(
    getActionAvailability('save', { projectedState, documentId: 'doc-2' }),
  ).toMatchObject({ kind: 'unavailable', reason: 'no-document' });
  expect(
    getActionAvailability('reopen', { projectedState, tabLimit: 2 }),
  ).toMatchObject({ kind: 'unavailable', reason: 'limit' });
  expect(
    getActionAvailability('reopen', { projectedState, tabLimit: 40 }),
  ).toEqual({ kind: 'available' });
});

it('derives modal, barrier, and edge unavailability deterministically', () => {
  const projectedState = {
    activeDocumentId: 'doc-1',
    orderedDocumentIds: ['doc-1', 'doc-2'],
    documents: { 'doc-1': { capability: 'writable' } },
  };

  expect(
    getActionAvailability('close-tab', {
      projectedState,
      modalOpen: true,
    }),
  ).toMatchObject({ kind: 'unavailable', reason: 'modal' });
  expect(
    getActionAvailability('close-tab', {
      projectedState,
      commandBarrier: true,
    }),
  ).toMatchObject({ kind: 'unavailable', reason: 'barrier' });
  expect(
    getActionAvailability('move-tab-left', {
      projectedState: {
        ...projectedState,
        orderedDocumentIds: ['doc-1', 'doc-2'],
      },
      documentId: 'doc-1',
      targetIndex: 0,
    }),
  ).toMatchObject({ kind: 'unavailable', reason: 'edge' });
});

it('derives the exact context surface order from the canonical registry', () => {
  expect(actionsForSurface('context').map((entry) => entry.id)).toEqual([
    'cut',
    'copy',
    'paste',
    'paste-plain',
    'bold',
    'italic',
    'link',
    'format',
    'compact',
    'command-palette',
  ]);
});

it('keeps File popup actions ordered and classifies deferred items explicitly', () => {
  expect(actionsForSurface('file-menu').map(({ id }) => id)).toEqual([
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
    'exit',
  ]);
  for (const actionId of [
    'new-file',
    'open-file',
    'save',
    'save-as',
    'close-tab',
    'exit',
  ] as const) {
    expect(getAction(actionId).availability.kind).toBe('available');
  }
  for (const actionId of ['new-window', 'open-folder', 'export-pdf'] as const) {
    expect(getAction(actionId).availability).toMatchObject({
      kind: 'deferred',
    });
  }
});

// Save As, and autosave MUST be unavailable" for an `unsafe-read-only`
// document. The requirement's first item, **editing**, is proved by the // case below and, at the editor widget, by the two cases in
// `EditorView.integration.test.tsx`; when this anchor was written that
// behaviour did not exist.
// The pre-disk write refusal is proved in Go by
// `TestRefusedWriteNamesTheFileNotTheDocumentID`.)
//
// `unsafe-read-only` is the capability Go actually emits (`file.Capability*`,
// projected through `save_status.go`), and until now nothing in the frontend
// tested against it. The one capability case in this file used `'read-only'` —
// a value `App.tsx:1260-1264` documents as one Go never sends — so the branch
// that has to hold for a NUL-bearing or invalid-UTF-8 file was exercised only
// through a string the backend cannot produce.
it('makes Save, Save As, format and lint unavailable for an unsafe-read-only document', () => {
  const projectedState = {
    activeDocumentId: 'unsafe',
    orderedDocumentIds: ['unsafe', 'writable'],
    documents: {
      unsafe: { capability: 'unsafe-read-only', path: '/documents/broken.md' },
      writable: { capability: 'writable', path: '/documents/fine.md' },
    },
    canReopenLastFile: false,
  };

  for (const id of ['save', 'save-as'] as const) {
    expect(
      getActionAvailability(id, { projectedState, documentId: 'unsafe' }),
    ).toMatchObject({ kind: 'unavailable' });
    // The same action on a writable document stays available, so the refusal
    // above is the capability and not a broken fixture.
    expect(
      getActionAvailability(id, { projectedState, documentId: 'writable' }),
    ).toEqual({ kind: 'available' });
  }

  // Formatting and lint are unavailable for every document today, because both
  // are registry-deferred to a later slice. That satisfies for an
  // unsafe-read-only document, and the assertion says which reason it is so a
  // future slice that makes them available cannot quietly make them available
  // here too.
  for (const id of ['format', 'lint'] as const) {
    expect(getAction(id).availability.kind).toBe('deferred');
    expect(
      getActionAvailability(id, { projectedState, documentId: 'unsafe' }),
    ).toMatchObject({ kind: 'unavailable', reason: 'deferred' });
  }
});

/*
 * — 's first item, "Editing … MUST be unavailable", which  * could not cover because nothing implemented it. `getActionAvailability`
 * applied its capability rule to `save` and `save-as` only, so every
 * `editor`-scope action stayed live on a document the backend will refuse to
 * write and the formatting toolbar kept working on it.
 *
 * Two things this pins deliberately.
 *
 * **`copy` is editor-scope and must stay available.** The requirement makes
 * *editing* unavailable, not the clipboard; a user must still be able to lift
 * text out of a file they cannot write. It is the one editor action that mutates
 * nothing, and asserting it here is what stops the fix being "disable the whole
 * scope".
 *
 * **`large-read-only` is gated too, not just `unsafe-read-only`.** A file over
 * 10 MiB () is equally unwritable, Go's own predicate is
 * `capability != writable` (`internal/appmodel/save.go`), and reading one string
 * would leave the larger case editable.
 */
it('makes mutating editor commands unavailable for a non-writable document', () => {
  const projectedState = {
    activeDocumentId: 'unsafe',
    orderedDocumentIds: ['unsafe', 'large', 'writable'],
    documents: {
      unsafe: { capability: 'unsafe-read-only', path: '/documents/broken.md' },
      large: { capability: 'large-read-only', path: '/documents/huge.md' },
      writable: { capability: 'writable', path: '/documents/fine.md' },
    },
    canReopenLastFile: false,
  };
  // Every editor-scope action that changes the buffer, except `image`, which is
  // registry-deferred and so unavailable for a different reason everywhere.
  const mutating = [
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
    'table',
    'cut',
    'paste',
    'paste-plain',
  ] as const;

  for (const documentId of ['unsafe', 'large'] as const) {
    for (const id of mutating) {
      expect(
        getActionAvailability(id, { projectedState, documentId }),
      ).toMatchObject({ kind: 'unavailable' });
    }
  }
  // The same commands on a writable document stay available, so the refusals
  // above are the capability and not a broken fixture.
  for (const id of mutating) {
    expect(
      getActionAvailability(id, { projectedState, documentId: 'writable' }),
    ).toEqual({ kind: 'available' });
  }
  // Copying out of a file you cannot write is not editing.
  for (const documentId of ['unsafe', 'large', 'writable'] as const) {
    expect(
      getActionAvailability('copy', { projectedState, documentId }),
    ).toEqual({ kind: 'available' });
  }
});
