import {
  ADDITIONAL_MANIFEST,
  ADDITIONAL_STATE_ASSIGNMENTS,
  ADDITIONAL_CASE_COUNT,
  BEHAVIOUR_VERIFICATION_COUNT,
  BEHAVIOUR_VERIFIED_CASE_COUNT,
  BEHAVIOUR_VERIFIED_MANIFEST,
  BEHAVIOUR_VERIFIED_STATE_IDS,
  COMPARISON_COUNT,
  comparisonsForRepetitions,
  assertManifestIntegrity,
  assertNoCaptureSatisfiesTwoStates,
  isBehaviourVerifiedEntry,
  LOGICAL_CASE_COUNT,
  PARITY_COUNTS,
  PARITY_MANIFEST,
  PARITY_PALETTES,
  PARITY_REPETITIONS,
  PARITY_WIDTHS,
  PIXEL_COMPARED_CASE_COUNT,
  PIXEL_COMPARED_MANIFEST,
  PIXEL_COMPARISON_COUNT,
  PRIMARY_CASE_COUNT,
  PRIMARY_FAMILIES,
  PRIMARY_MANIFEST,
  VERIFICATION_COUNT,
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
  expect(PARITY_COUNTS.primary).toBe(17 * 3 * 6);
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

  expect(PARITY_COUNTS.additional).toBe(40 * 6);
});

it('manifest contains exactly 546 logical keys', () => {
  expect(PARITY_MANIFEST).toHaveLength(LOGICAL_CASE_COUNT);
  expect(unique(PARITY_MANIFEST.map(({ key }) => key)).size).toBe(
    LOGICAL_CASE_COUNT,
  );
  expect(PARITY_COUNTS.logical).toBe(306 + 240);
  expect(() => assertManifestIntegrity()).not.toThrow();
});

it('three repetitions execute exactly 1638 comparisons without new keys', () => {
  const comparisons = comparisonsForRepetitions(PARITY_REPETITIONS);
  const logicalKeys = unique(PARITY_MANIFEST.map(({ key }) => key));
  const comparisonKeys = unique(
    comparisons.map(({ manifestKey }) => manifestKey),
  );

  expect(comparisons).toHaveLength(COMPARISON_COUNT);
  expect(comparisonKeys).toEqual(logicalKeys);
  expect(comparisonKeys.size).toBe(LOGICAL_CASE_COUNT);
  expect(PARITY_COUNTS.comparisons).toBe(3 * 546);

  for (const key of logicalKeys) {
    expect(
      comparisons.filter(({ manifestKey }) => manifestKey === key),
    ).toHaveLength(3);
  }
});

it('splits the 546 logical keys into 510 pixel-compared and 36 behaviour-verified', () => {
  expect(BEHAVIOUR_VERIFIED_STATE_IDS).toEqual([
    'status-saved',
    'status-autosaved',
    'status-unsaved-changes',
    'status-read-only',
    'status-mixed-ending',
    'status-large-file',
  ]);

  // No editor-status state is pixel-compared: the binding's status row and
  // production's cannot pair on absolute bounds at all.
  for (const stateId of BEHAVIOUR_VERIFIED_STATE_IDS) {
    expect(
      PIXEL_COMPARED_MANIFEST.filter(
        (entry) => entry.kind === 'additional' && entry.stateId === stateId,
      ),
    ).toHaveLength(0);
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
  expect(PIXEL_COMPARED_MANIFEST).toHaveLength(PIXEL_COMPARED_CASE_COUNT);
  expect(PIXEL_COMPARED_CASE_COUNT).toBe(510);
  expect(PIXEL_COMPARED_CASE_COUNT + BEHAVIOUR_VERIFIED_CASE_COUNT).toBe(
    LOGICAL_CASE_COUNT,
  );

  // Every logical key is verified exactly once, by exactly one method.
  expect(
    unique([
      ...PIXEL_COMPARED_MANIFEST.map(({ key }) => key),
      ...BEHAVIOUR_VERIFIED_MANIFEST.map(({ key }) => key),
    ]).size,
  ).toBe(LOGICAL_CASE_COUNT);
  expect(PARITY_MANIFEST.filter(isBehaviourVerifiedEntry)).toHaveLength(
    BEHAVIOUR_VERIFIED_CASE_COUNT,
  );
  expect(PRIMARY_MANIFEST.some(isBehaviourVerifiedEntry)).toBe(false);

  expect(PARITY_COUNTS.pixelCompared).toBe(510);
  expect(PARITY_COUNTS.behaviourVerified).toBe(36);
});

it('three repetitions execute 1530 pixel comparisons plus 108 behaviour verifications', () => {
  expect(PIXEL_COMPARISON_COUNT).toBe(510 * 3);
  expect(BEHAVIOUR_VERIFICATION_COUNT).toBe(36 * 3);
  expect(PIXEL_COMPARISON_COUNT + BEHAVIOUR_VERIFICATION_COUNT).toBe(
    VERIFICATION_COUNT,
  );
  expect(VERIFICATION_COUNT).toBe(COMPARISON_COUNT);
  expect(VERIFICATION_COUNT).toBe(1638);
  expect(PARITY_COUNTS.pixelComparisons).toBe(1530);
  expect(PARITY_COUNTS.behaviourVerifications).toBe(108);
  expect(PARITY_COUNTS.verifications).toBe(1638);
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
