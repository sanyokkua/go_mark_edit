import {
  ADDITIONAL_MANIFEST,
  ADDITIONAL_STATE_ASSIGNMENTS,
  ADDITIONAL_CASE_COUNT,
  BEHAVIOUR_VERIFIED_CASE_COUNT,
  BEHAVIOUR_VERIFIED_MANIFEST,
  BEHAVIOUR_VERIFIED_STATE_IDS,
  assertManifestIntegrity,
  assertNoCaptureSatisfiesTwoStates,
  isBehaviourVerifiedEntry,
  LOGICAL_CASE_COUNT,
  PARITY_MANIFEST,
  PARITY_PALETTES,
  PARITY_WIDTHS,
  PRIMARY_CASE_COUNT,
  PRIMARY_FAMILIES,
  PRIMARY_MANIFEST,
} from './manifest';

const unique = <T>(values: readonly T[]) => new Set(values);

const expectedStateAssignments = {
  'tab-active': ['editor-split', 1280],
  'tab-inactive': ['editor-split', 1280],
  'tab-dirty': ['editor-split', 1280],
  'tab-autosave-in-flight': ['editor-split', 1280],
  'tab-read-only': ['editor-split', 1280],
  'tab-detached': ['editor-split', 1280],
  'tab-blocked-conflict': ['editor-split', 1280],
  'tab-identical-basename': ['editor-split', 1280],
  'tab-adjacent-after-close': ['editor-split', 1280],
  'label-short': ['editor-split', 1280],
  'tab-contained-overflow': ['editor-split', 375],
  'tab-40-document': ['editor-split', 375],
  'label-long-localized': ['editor-split', 375],
  'path-hostile-disambiguated': ['editor-split', 375],
  'identity-not-saved': ['editor-only', 1280],
  'status-saved': ['editor-only', 1280],
  'status-autosaved': ['editor-only', 1280],
  'status-unsaved-changes': ['editor-only', 1280],
  'status-read-only': ['editor-only', 1280],
  'status-mixed-ending': ['editor-only', 1280],
  'status-large-file': ['editor-only', 1280],
  'launcher-first-run': ['empty', 1280],
  'launcher-six-file': ['empty', 375],
  'control-enabled': ['menu-file', 1280],
  'control-checked': ['menu-settings', 1280],
  'control-selected': ['menu-view', 1280],
  'control-focused': ['menu-file', 1280],
  'control-hovered': ['menu-file', 1280],
  'control-unavailable': ['menu-file', 1280],
  'tab-menu-move-left-unavailable': ['tab-menu', 375],
  'tab-menu-move-right-unavailable': ['tab-menu', 375],
  'preview-paused': ['preview-only', 375],
  'preview-refreshing': ['preview-only', 375],
  'preview-refresh-failed': ['preview-only', 375],
  'prompt-normalization': ['save-prompt', 375],
  'conflict-content-truncated': ['reload-prompt', 375],
  'conflict-metadata-only': ['reload-prompt', 375],
  'conflict-read-only': ['reload-prompt', 375],
  'resync-recovery': ['save-prompt', 375],
  'quit-discard-newer': ['quit-prompt', 375],
} as const;

it('manifest contains exactly 306 primary keys', () => {
  expect(PRIMARY_FAMILIES).toHaveLength(17);
  expect(PRIMARY_FAMILIES).toEqual([
    'editor-split',
    'editor-only',
    'preview-only',
    'menu-file',
    'menu-settings',
    'menu-view',
    'menu-about',
    'tab-menu',
    'toolbar-overflow',
    'empty',
    'save-prompt',
    'quit-prompt',
    'reload-prompt',
    'toasts',
    'settings-appearance',
    'settings-editor',
    'settings-markdown',
  ]);
  expect(PARITY_WIDTHS).toEqual([1280, 768, 375]);
  expect(PARITY_PALETTES.map(({ id }) => id)).toEqual([
    'glass-light',
    'glass-dark',
    'material-light',
    'material-dark',
    'minimal-light',
    'minimal-dark',
  ]);
  expect(PRIMARY_MANIFEST).toHaveLength(PRIMARY_CASE_COUNT);
  expect(unique(PRIMARY_MANIFEST.map(({ key }) => key)).size).toBe(
    PRIMARY_CASE_COUNT,
  );
  expect(PRIMARY_CASE_COUNT).toBe(17 * 3 * 6);
});

it('manifest contains exactly 240 additional keys across 40 state IDs', () => {
  expect(ADDITIONAL_STATE_ASSIGNMENTS).toHaveLength(40);
  expect(
    unique(ADDITIONAL_STATE_ASSIGNMENTS.map(({ stateId }) => stateId)).size,
  ).toBe(40);
  expect(ADDITIONAL_MANIFEST).toHaveLength(ADDITIONAL_CASE_COUNT);
  expect(unique(ADDITIONAL_MANIFEST.map(({ key }) => key)).size).toBe(
    ADDITIONAL_CASE_COUNT,
  );

  for (const assignment of ADDITIONAL_STATE_ASSIGNMENTS) {
    const cases = ADDITIONAL_MANIFEST.filter(
      ({ stateId }) => stateId === assignment.stateId,
    );
    expect(cases).toHaveLength(6);
    expect(unique(cases.map(({ palette }) => palette.id)).size).toBe(6);
  }

  expect(ADDITIONAL_CASE_COUNT).toBe(40 * 6);
});

it('manifest contains exactly 546 reference-navigation keys', () => {
  expect(PARITY_MANIFEST).toHaveLength(LOGICAL_CASE_COUNT);
  expect(unique(PARITY_MANIFEST.map(({ key }) => key)).size).toBe(
    LOGICAL_CASE_COUNT,
  );
  expect(LOGICAL_CASE_COUNT).toBe(306 + 240);
  expect(() => assertManifestIntegrity()).not.toThrow();
});

/*
 * The 546 keys are an index that T050 and T057 navigate by, not a comparison
 * contract — spec.md Session 2026-08-14 withdrew the whole-screen contract and
 * f9a34a7b removed its runner. These are the two lookups that still read the
 * index, asserted here on shape rather than by duplicating the Playwright
 * probe tables, so the surviving key count is justified by what consumes it.
 */
it('resolves every entry T050 and T057 navigate by', () => {
  // T050 resolves a primary entry from (family, width, palette) and throws when
  // the lookup misses. A duplicate would be worse than a miss: `find` would take
  // the first and the probe would navigate somewhere unintended without failing.
  for (const family of PRIMARY_FAMILIES) {
    for (const width of PARITY_WIDTHS) {
      for (const palette of PARITY_PALETTES) {
        expect(
          PARITY_MANIFEST.filter(
            (entry) =>
              entry.kind === 'primary' &&
              entry.family === family &&
              entry.width === width &&
              entry.palette.id === palette.id,
          ),
        ).toHaveLength(1);
      }
    }
  }

  // T057 filters the file-only launcher pairs out of the same index and asserts
  // it got four. Two are primary and two are launcher state assignments, so both
  // halves of the expansion have to survive for that filter to hold.
  expect(
    PARITY_MANIFEST.filter(
      (entry) =>
        entry.family === 'empty' &&
        entry.palette.id === 'minimal-light' &&
        (entry.width === 1280 || entry.width === 375),
    ).map(({ key }) => key),
  ).toEqual([
    'primary:empty:1280:minimal-light',
    'primary:empty:375:minimal-light',
    'state:launcher-first-run:minimal-light',
    'state:launcher-six-file:minimal-light',
  ]);
});

it('declares 36 behaviour-verified keys and no editor-status pixel comparison', () => {
  expect(BEHAVIOUR_VERIFIED_STATE_IDS).toEqual([
    'status-saved',
    'status-autosaved',
    'status-unsaved-changes',
    'status-read-only',
    'status-mixed-ending',
    'status-large-file',
  ]);

  // No editor-status state can be pixel-compared: the binding's status row and
  // production's cannot pair on absolute bounds at all.
  for (const stateId of BEHAVIOUR_VERIFIED_STATE_IDS) {
    expect(
      BEHAVIOUR_VERIFIED_MANIFEST.filter(
        (entry) => entry.kind === 'additional' && entry.stateId === stateId,
      ),
    ).toHaveLength(6);
  }

  expect(BEHAVIOUR_VERIFIED_MANIFEST).toHaveLength(
    BEHAVIOUR_VERIFIED_CASE_COUNT,
  );
  expect(BEHAVIOUR_VERIFIED_CASE_COUNT).toBe(6 * 6);
  expect(PARITY_MANIFEST.filter(isBehaviourVerifiedEntry)).toHaveLength(
    BEHAVIOUR_VERIFIED_CASE_COUNT,
  );
  expect(PRIMARY_MANIFEST.some(isBehaviourVerifiedEntry)).toBe(false);
});

it('each additional state ID uses its assigned family and width', () => {
  for (const assignment of ADDITIONAL_STATE_ASSIGNMENTS) {
    const expected = expectedStateAssignments[assignment.stateId];
    expect(expected).toBeDefined();
    expect([assignment.family, assignment.width]).toEqual(expected);

    const stateCases = ADDITIONAL_MANIFEST.filter(
      ({ stateId }) => stateId === assignment.stateId,
    );
    expect(unique(stateCases.map(({ family }) => family))).toEqual(
      new Set([assignment.family]),
    );
    expect(unique(stateCases.map(({ width }) => width))).toEqual(
      new Set([assignment.width]),
    );
  }

  expect(Object.keys(expectedStateAssignments)).toHaveLength(40);
});

it('no capture satisfies two state IDs', () => {
  const stateCases = ADDITIONAL_MANIFEST;
  const stateIdsByCaptureKey = new Map<string, Set<string>>();

  for (const entry of stateCases) {
    const stateIds =
      stateIdsByCaptureKey.get(entry.captureKey) ?? new Set<string>();
    stateIds.add(entry.stateId);
    stateIdsByCaptureKey.set(entry.captureKey, stateIds);
  }

  expect(stateCases.every(({ stateId }) => Boolean(stateId))).toBe(true);
  expect(
    [...stateIdsByCaptureKey.values()].every((ids) => ids.size === 1),
  ).toBe(true);
  expect(stateIdsByCaptureKey.size).toBe(stateCases.length);
  expect(unique(stateCases.map(({ stateId }) => stateId)).size).toBe(40);
  expect(
    new Set(stateCases.map(({ key, stateId }) => `${key}:${stateId}`)).size,
  ).toBe(stateCases.length);

  expect(() =>
    assertNoCaptureSatisfiesTwoStates([
      { captureKey: 'capture-1', stateId: 'tab-active' },
      { captureKey: 'capture-1', stateId: 'tab-dirty' },
    ]),
  ).toThrow('capture capture-1 satisfies multiple state IDs');
});
