import { t } from '../../../src/i18n';
import {
    actionRegistry,
    actionsForSurface,
    groupedActionsForSurface,
    getActionAvailability,
    getAction,
    actionUnavailableLabelKey,
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

    expect(getAction('toggle-assistant')).toBe(getAction('toggle-assistant' as ActionId));
    expect(getAction('toggle-assistant').availability.kind).toBe('deferred');
    expect(getAction('format').availability.kind).toBe('available');
    expect(getAction('command-palette').availability.kind).toBe('deferred');
    expect(getAction('bold').shortcut).toBe('Mod+B');
    expect(getAction('new-file').availability.kind).toBe('available');
    expect(getAction('open-file').availability.kind).toBe('available');
    expect(getAction('autosave').availability.kind).toBe('available');
    expect(getAction('refresh-preview').shortcut).toBeUndefined();
    expect(getAction('refresh-preview').surfaces).toContain('preview');
    for (const id of ['preview-copy', 'preview-select-all'] as const) {
        expect(getAction(id).shortcut).toBeUndefined();
        expect(getAction(id).surfaces).toEqual(['preview']);
        expect(getAction(id).scope).toBe('window');
    }
});

it('keeps required surface membership and omits deferred actions from native clipboard ownership', () => {
    expect(getAction('bold').surfaces).toEqual(expect.arrayContaining(['toolbar', 'context', 'shortcuts']));
    expect(getAction('heading-1').surfaces).toEqual(expect.arrayContaining(['toolbar', 'shortcuts']));
    expect(getAction('lint').surfaces).toContain('context');
    expect(getAction('paste').nativeRole).toBe('clipboard');
    expect(getAction('bold').nativeRole).toBe('none');
});

it('exposes Find and Replace shortcuts with read-only and modal availability', () => {
    const readOnly = { activeDocumentId: 'doc-1', documents: { 'doc-1': { capability: 'unsafe-read-only' } } };
    expect(getAction('find').shortcut).toBe('Mod+F');
    expect(getAction('replace').shortcut).toBe('Mod+R');
    expect(actionsForSurface('shortcuts').map(({ id }) => id)).toEqual(expect.arrayContaining(['find', 'replace']));
    expect(getActionAvailability('find', { projectedState: readOnly })).toEqual({ kind: 'available' });
    expect(getActionAvailability('replace', { projectedState: readOnly })).toEqual({
        kind: 'unavailable',
        reason: 'no-document',
    });
    expect(getActionAvailability('find', { projectedState: readOnly, modalOpen: true })).toEqual({
        kind: 'unavailable',
        reason: 'modal',
    });
});

it('makes Save and Save As available document actions in the File menu', () => {
    expect(getAction('save').availability.kind).toBe('available');
    expect(getAction('save-as').availability.kind).toBe('available');
    expect(getAction('save').scope).toBe('document');
    expect(getAction('save-as').scope).toBe('document');
});

it('gates marker actions and Markdown controls while settings are loading', () => {
    for (const id of [
        'italic',
        'bullet-list',
        'task-list',
        'markdown-standard',
        'format-on-save',
        'lint-on-save',
    ] as const) {
        expect(getActionAvailability(id, { markdownSettingsLoaded: false })).toEqual({
            kind: 'unavailable',
            reason: 'settings-loading',
        });
    }
    for (const id of ['bold', 'heading-1', 'numbered-list', 'copy'] as const) {
        expect(getActionAvailability(id, { markdownSettingsLoaded: false })).toEqual({ kind: 'available' });
    }
});

it('allows hydrated Markdown controls and save preferences while loading keeps them unavailable', () => {
    expect(getActionAvailability('markdown-standard', { markdownSettingsLoaded: true })).toEqual({ kind: 'available' });
    expect(getActionAvailability('format-on-save', { markdownSettingsLoaded: true })).toEqual({ kind: 'available' });
    expect(getActionAvailability('lint-on-save', { markdownSettingsLoaded: true })).toEqual({ kind: 'available' });
    expect(getActionAvailability('format-on-save', { markdownSettingsLoaded: false })).toEqual({
        kind: 'unavailable',
        reason: 'settings-loading',
    });
    expect(getActionAvailability('lint-on-save', { markdownSettingsLoaded: false })).toEqual({
        kind: 'unavailable',
        reason: 'settings-loading',
    });
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

    expect(getActionAvailability('new-file', { projectedState, tabLimit: 40 })).toEqual({ kind: 'available' });
    expect(getActionAvailability('save', { projectedState, documentId: 'doc-1' })).toEqual({ kind: 'available' });
    expect(getActionAvailability('save', { projectedState, documentId: 'doc-2' })).toMatchObject({
        kind: 'unavailable',
        reason: 'no-document',
    });
    expect(getActionAvailability('reopen', { projectedState, tabLimit: 2 })).toEqual({ kind: 'available' });
    expect(
        getActionAvailability('open-recent', {
            projectedState: { ...projectedState, recentItems: [{ path: '/tmp/project', kind: 'folder' }] },
            tabLimit: 2,
        }),
    ).toEqual({ kind: 'available' });
    expect(getActionAvailability('reopen', { projectedState, tabLimit: 40 })).toEqual({ kind: 'available' });
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

it('gates each tidy action by settings, document capability, and the operation slot', () => {
    const writable = { activeDocumentId: 'doc', documents: { doc: { capability: 'writable' } } };
    const readOnly = { activeDocumentId: 'doc', documents: { doc: { capability: 'unsafe-read-only' } } };
    const missing = { activeDocumentId: null, documents: {} };
    for (const id of ['format', 'compact', 'lint'] as const) {
        expect(getActionAvailability(id, { markdownSettingsLoaded: false, projectedState: writable })).toEqual({
            kind: 'unavailable',
            reason: 'settings-loading',
        });
        expect(getActionAvailability(id, { markdownSettingsLoaded: true, projectedState: missing })).toEqual({
            kind: 'unavailable',
            reason: 'no-document',
        });
        expect(getActionAvailability(id, { markdownSettingsLoaded: true, projectedState: writable })).toEqual({
            kind: 'available',
        });
        expect(
            getActionAvailability(id, { markdownSettingsLoaded: true, projectedState: readOnly, slotBusy: true }),
        ).toEqual({
            kind: 'unavailable',
            reason: 'slot-busy',
        });
    }
    for (const id of ['format', 'compact'] as const) {
        expect(getActionAvailability(id, { markdownSettingsLoaded: true, projectedState: readOnly })).toEqual({
            kind: 'unavailable',
            reason: 'read-only',
        });
    }
    expect(getActionAvailability('lint', { markdownSettingsLoaded: true, projectedState: readOnly })).toEqual({
        kind: 'available',
    });
    expect(actionsForSurface('markdown-menu').map(({ id }) => id)).toContain('lint');
    expect(actionsForSurface('toolbar').map(({ id }) => id)).toContain('format');
    expect(actionsForSurface('toolbar').map(({ id }) => id)).not.toContain('compact');
    expect(actionsForSurface('toolbar').map(({ id }) => id)).not.toContain('lint');
    expect(actionsForSurface('context').map(({ id }) => id)).toContain('lint');
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
        'lint',
        'command-palette',
    ]);
});

it('keeps File popup actions ordered and classifies deferred items explicitly', () => {
    expect(actionsForSurface('file-menu').map(({ id }) => id)).toEqual([
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
        'exit',
    ]);
    for (const actionId of [
        'new-file',
        'new-window',
        'open-file',
        'open-folder',
        'close-folder',
        'save',
        'save-as',
        'close-tab',
        'exit',
    ] as const) {
        expect(getAction(actionId).availability.kind).toBe('available');
    }
    expect(getAction('export-pdf').availability.kind).toBe('available');
});

describe('Export to PDF availability', () => {
    const withDocument = {
        documentId: 'doc-1',
        projectedState: {
            activeDocumentId: 'doc-1',
            documents: { 'doc-1': { capability: 'writable', path: '/notes/a.md' } },
            orderedDocumentIds: ['doc-1'],
        },
    };

    it('is available for an open document, including a read-only one', () => {
        expect(getActionAvailability('export-pdf', withDocument)).toEqual({ kind: 'available' });
        expect(
            getActionAvailability('export-pdf', {
                ...withDocument,
                projectedState: {
                    ...withDocument.projectedState,
                    documents: { 'doc-1': { capability: 'unsafe-read-only', path: '/notes/a.md' } },
                },
            }),
        ).toEqual({ kind: 'available' });
    });

    it('is unavailable when no document is open', () => {
        expect(
            getActionAvailability('export-pdf', {
                projectedState: { activeDocumentId: null, documents: {}, orderedDocumentIds: [] },
            }),
        ).toEqual({ kind: 'unavailable', reason: 'no-document' });
    });

    it('is unavailable while a modal dialog is open', () => {
        expect(getActionAvailability('export-pdf', { ...withDocument, modalOpen: true })).toEqual({
            kind: 'unavailable',
            reason: 'modal',
        });
    });

    it('is bound to Mod+P and listed in the shortcuts surface', () => {
        expect(getAction('export-pdf')).toMatchObject({ shortcut: 'Mod+P' });
        expect(getAction('export-pdf').surfaces).toEqual(expect.arrayContaining(['file-menu', 'shortcuts']));
    });
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
it('keeps Lint available while Save, Save As and Format are unavailable for an unsafe-read-only document', () => {
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
        expect(getActionAvailability(id, { projectedState, documentId: 'unsafe' })).toMatchObject({
            kind: 'unavailable',
        });
        // The same action on a writable document stays available, so the refusal
        // above is the capability and not a broken fixture.
        expect(getActionAvailability(id, { projectedState, documentId: 'writable' })).toEqual({ kind: 'available' });
    }

    expect(getActionAvailability('format', { projectedState, documentId: 'unsafe' })).toEqual({
        kind: 'unavailable',
        reason: 'read-only',
    });
    expect(getActionAvailability('lint', { projectedState, documentId: 'unsafe' })).toEqual({ kind: 'available' });
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
        'table',
        'cut',
        'paste',
        'paste-plain',
    ] as const;

    for (const documentId of ['unsafe', 'large'] as const) {
        for (const id of mutating) {
            expect(getActionAvailability(id, { projectedState, documentId })).toMatchObject({ kind: 'unavailable' });
        }
    }
    // The same commands on a writable document stay available, so the refusals
    // above are the capability and not a broken fixture.
    for (const id of mutating) {
        expect(getActionAvailability(id, { projectedState, documentId: 'writable' })).toEqual({ kind: 'available' });
    }
    // Copying out of a file you cannot write is not editing.
    for (const documentId of ['unsafe', 'large', 'writable'] as const) {
        expect(getActionAvailability('copy', { projectedState, documentId })).toEqual({ kind: 'available' });
    }
});

it('offers Distraction-free reading on Mod+Enter only while a document is open', () => {
    const action = getAction('distraction-free-reading');
    expect(action.shortcut).toBe('Mod+Enter');
    expect(action.surfaces).toEqual(['view-menu', 'shortcuts']);
    expect(getActionAvailability('distraction-free-reading', { documentId: 'doc-1' })).toEqual({ kind: 'available' });
    expect(getActionAvailability('distraction-free-reading')).toEqual({
        kind: 'unavailable',
        reason: 'no-document',
    });
    expect(
        getActionAvailability('distraction-free-reading', {
            documentId: 'doc-1',
            projectedState: { activeDocumentId: 'doc-2', documents: {} },
        }),
    ).toEqual({ kind: 'unavailable', reason: 'no-document' });
});

it('groups the Markdown menu actions under their heading keys in registry order', () => {
    expect(
        groupedActionsForSurface('markdown-menu').map(({ groupKey, actions }) => [
            groupKey,
            actions.map(({ id }) => id),
        ]),
    ).toEqual([
        ['menu.markdown.group.text', ['bold', 'italic', 'bold-italic', 'strike', 'inline-code']],
        [
            'menu.markdown.group.headings',
            ['heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5', 'heading-6'],
        ],
        ['menu.markdown.group.lists', ['bullet-list', 'numbered-list', 'task-list', 'quote']],
        ['menu.markdown.group.insert', ['link', 'image', 'table']],
        ['menu.markdown.group.tidy', ['format', 'compact', 'lint']],
    ]);
    expect(getAction('table').surfaceLabelKeys?.['markdown-menu']).toBe('action.table.markdown-menu.label');
});

describe('editor formatting availability', () => {
    const formattingIds = [
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
        'table',
    ] as const;
    const writable = {
        activeDocumentId: 'doc',
        documents: { doc: { capability: 'writable' as const } },
    };

    it('is unavailable with the editor-hidden reason when the editor is not shown', () => {
        for (const id of formattingIds) {
            expect(
                getActionAvailability(id, {
                    markdownSettingsLoaded: true,
                    projectedState: writable,
                    editorShown: false,
                }),
            ).toEqual({
                kind: 'unavailable',
                reason: 'editor-hidden',
            });
            expect(getActionAvailability(id, { markdownSettingsLoaded: true, editorShown: false })).toEqual({
                kind: 'unavailable',
                reason: 'editor-hidden',
            });
        }
    });

    it('is unchanged when the editor is shown or the field is absent', () => {
        for (const id of formattingIds) {
            expect(
                getActionAvailability(id, {
                    markdownSettingsLoaded: true,
                    projectedState: writable,
                    editorShown: true,
                }),
            ).toEqual({ kind: 'available' });
            expect(getActionAvailability(id, { markdownSettingsLoaded: true, projectedState: writable })).toEqual({
                kind: 'available',
            });
        }
    });

    it('leaves Format, Compact, Lint, Find and Copy to their own rules', () => {
        for (const id of ['format', 'compact', 'lint', 'find', 'copy'] as const) {
            expect(
                getActionAvailability(id, {
                    markdownSettingsLoaded: true,
                    projectedState: writable,
                    editorShown: false,
                }),
            ).toEqual({ kind: 'available' });
        }
    });

    it('states the reason "Show the editor to use formatting."', () => {
        expect(t(actionUnavailableLabelKey('editor-hidden'))).toBe('Show the editor to use formatting.');
    });
});
