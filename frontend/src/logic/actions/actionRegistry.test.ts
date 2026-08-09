import { t } from '../../i18n';
import {
  actionRegistry,
  actionsForSurface,
  getActionAvailability,
  getAction,
  type ActionId,
} from './actionRegistry';

it('T002 exposes one localized registry entry for every Editor-stage identity', () => {
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

it('T002 keeps required surface membership and omits deferred actions from native clipboard ownership', () => {
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

it('T015 makes Save and Save As available document actions in the File menu', () => {
  expect(getAction('save').availability.kind).toBe('available');
  expect(getAction('save-as').availability.kind).toBe('available');
  expect(getAction('save').scope).toBe('document');
  expect(getAction('save-as').scope).toBe('document');
});

it('T030 exposes the exact canonical file and tab shortcut inventory', () => {
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

it('T030 derives lifecycle availability from projected capability and limits', () => {
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

it('T030 derives modal, barrier, and edge unavailability deterministically', () => {
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

it('T043 derives the exact context surface order from the canonical registry', () => {
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
