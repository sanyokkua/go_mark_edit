import { t } from '../../i18n';
import {
  actionRegistry,
  actionsForSurface,
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
