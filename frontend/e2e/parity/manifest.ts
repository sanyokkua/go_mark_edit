export const PARITY_HEIGHT = 720 as const;
export const PARITY_REPETITIONS = 3 as const;
export const PRIMARY_CASE_COUNT = 306 as const;
export const ADDITIONAL_CASE_COUNT = 240 as const;
export const LOGICAL_CASE_COUNT = 546 as const;
export const COMPARISON_COUNT = 1638 as const;

export const PARITY_WIDTHS = Object.freeze([1280, 768, 375] as const);

export const PARITY_PALETTES = Object.freeze([
  Object.freeze({ id: 'glass-light', theme: 'glass', mode: 'light' }),
  Object.freeze({ id: 'glass-dark', theme: 'glass', mode: 'dark' }),
  Object.freeze({ id: 'material-light', theme: 'material', mode: 'light' }),
  Object.freeze({ id: 'material-dark', theme: 'material', mode: 'dark' }),
  Object.freeze({ id: 'minimal-light', theme: 'minimal', mode: 'light' }),
  Object.freeze({ id: 'minimal-dark', theme: 'minimal', mode: 'dark' }),
] as const);

export const PRIMARY_FAMILIES = Object.freeze([
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
] as const);

export type ParityFamily = (typeof PRIMARY_FAMILIES)[number];
export type ParityWidth = (typeof PARITY_WIDTHS)[number];
export type ParityPalette = (typeof PARITY_PALETTES)[number];
export type ParityPaletteId = ParityPalette['id'];

const defineStateAssignment = <
  const StateId extends string,
  const Family extends ParityFamily,
  const Width extends ParityWidth,
>(
  stateId: StateId,
  family: Family,
  width: Width,
) => Object.freeze({ stateId, family, width });

export const ADDITIONAL_STATE_ASSIGNMENTS = Object.freeze([
  defineStateAssignment('tab-active', 'editor-split', 1280),
  defineStateAssignment('tab-inactive', 'editor-split', 1280),
  defineStateAssignment('tab-dirty', 'editor-split', 1280),
  defineStateAssignment('tab-autosave-in-flight', 'editor-split', 1280),
  defineStateAssignment('tab-read-only', 'editor-split', 1280),
  defineStateAssignment('tab-detached', 'editor-split', 1280),
  defineStateAssignment('tab-blocked-conflict', 'editor-split', 1280),
  defineStateAssignment('tab-identical-basename', 'editor-split', 1280),
  defineStateAssignment('tab-adjacent-after-close', 'editor-split', 1280),
  defineStateAssignment('label-short', 'editor-split', 1280),
  defineStateAssignment('tab-contained-overflow', 'editor-split', 375),
  defineStateAssignment('tab-40-document', 'editor-split', 375),
  defineStateAssignment('label-long-localized', 'editor-split', 375),
  defineStateAssignment('path-hostile-disambiguated', 'editor-split', 375),
  defineStateAssignment('identity-not-saved', 'editor-only', 1280),
  defineStateAssignment('status-saved', 'editor-only', 1280),
  defineStateAssignment('status-autosaved', 'editor-only', 1280),
  defineStateAssignment('status-unsaved-changes', 'editor-only', 1280),
  defineStateAssignment('status-read-only', 'editor-only', 1280),
  defineStateAssignment('status-mixed-ending', 'editor-only', 1280),
  defineStateAssignment('status-large-file', 'editor-only', 1280),
  defineStateAssignment('launcher-first-run', 'empty', 1280),
  defineStateAssignment('launcher-six-file', 'empty', 375),
  defineStateAssignment('control-enabled', 'menu-file', 1280),
  defineStateAssignment('control-checked', 'menu-settings', 1280),
  defineStateAssignment('control-selected', 'menu-view', 1280),
  defineStateAssignment('control-focused', 'menu-file', 1280),
  defineStateAssignment('control-hovered', 'menu-file', 1280),
  defineStateAssignment('control-unavailable', 'menu-file', 1280),
  defineStateAssignment('tab-menu-move-left-unavailable', 'tab-menu', 375),
  defineStateAssignment('tab-menu-move-right-unavailable', 'tab-menu', 375),
  defineStateAssignment('preview-paused', 'preview-only', 375),
  defineStateAssignment('preview-refreshing', 'preview-only', 375),
  defineStateAssignment('preview-refresh-failed', 'preview-only', 375),
  defineStateAssignment('prompt-normalization', 'save-prompt', 375),
  defineStateAssignment('conflict-content-truncated', 'reload-prompt', 375),
  defineStateAssignment('conflict-metadata-only', 'reload-prompt', 375),
  defineStateAssignment('conflict-read-only', 'reload-prompt', 375),
  defineStateAssignment('resync-recovery', 'save-prompt', 375),
  defineStateAssignment('quit-discard-newer', 'quit-prompt', 375),
] as const);

export type ParityStateId =
  (typeof ADDITIONAL_STATE_ASSIGNMENTS)[number]['stateId'];
type ManifestEntryBase = Readonly<{
  key: string;
  captureKey: string;
  family: ParityFamily;
  width: ParityWidth;
  height: typeof PARITY_HEIGHT;
  palette: ParityPalette;
}>;

export type PrimaryManifestEntry = ManifestEntryBase &
  Readonly<{ kind: 'primary' }>;
export type AdditionalManifestEntry = ManifestEntryBase &
  Readonly<{ kind: 'additional'; stateId: ParityStateId }>;
export type ManifestEntry = PrimaryManifestEntry | AdditionalManifestEntry;

const definePrimaryEntry = (
  family: ParityFamily,
  width: ParityWidth,
  palette: ParityPalette,
): PrimaryManifestEntry =>
  Object.freeze({
    kind: 'primary',
    key: `primary:${family}:${width}:${palette.id}`,
    captureKey: `primary:${family}:${width}:${palette.id}`,
    family,
    width,
    height: PARITY_HEIGHT,
    palette,
  });

const defineAdditionalEntry = (
  stateId: ParityStateId,
  family: ParityFamily,
  width: ParityWidth,
  palette: ParityPalette,
): AdditionalManifestEntry =>
  Object.freeze({
    kind: 'additional',
    key: `state:${stateId}:${palette.id}`,
    captureKey: `state:${stateId}:${family}:${width}:${palette.id}`,
    stateId,
    family,
    width,
    height: PARITY_HEIGHT,
    palette,
  });

export const PRIMARY_MANIFEST = Object.freeze(
  PRIMARY_FAMILIES.flatMap((family) =>
    PARITY_WIDTHS.flatMap((width) =>
      PARITY_PALETTES.map((palette) =>
        definePrimaryEntry(family, width, palette),
      ),
    ),
  ),
);

export const ADDITIONAL_MANIFEST = Object.freeze(
  ADDITIONAL_STATE_ASSIGNMENTS.flatMap(({ stateId, family, width }) =>
    PARITY_PALETTES.map((palette) =>
      defineAdditionalEntry(stateId, family, width, palette),
    ),
  ),
);

export const PARITY_MANIFEST = Object.freeze([
  ...PRIMARY_MANIFEST,
  ...ADDITIONAL_MANIFEST,
]);

export const PARITY_COUNTS = Object.freeze({
  families: PRIMARY_FAMILIES.length,
  widths: PARITY_WIDTHS.length,
  palettes: PARITY_PALETTES.length,
  primary: PRIMARY_MANIFEST.length,
  stateIds: ADDITIONAL_STATE_ASSIGNMENTS.length,
  additional: ADDITIONAL_MANIFEST.length,
  logical: PARITY_MANIFEST.length,
  repetitions: PARITY_REPETITIONS,
  comparisons: PARITY_MANIFEST.length * PARITY_REPETITIONS,
});

const unique = <T>(values: readonly T[]): Set<T> => new Set(values);

const expectedPrimaryKeys = new Set(
  PRIMARY_FAMILIES.flatMap((family) =>
    PARITY_WIDTHS.flatMap((width) =>
      PARITY_PALETTES.map(({ id }) => `primary:${family}:${width}:${id}`),
    ),
  ),
);

const expectedAdditionalKeys = new Set(
  ADDITIONAL_STATE_ASSIGNMENTS.flatMap(({ stateId }) =>
    PARITY_PALETTES.map(({ id }) => `state:${stateId}:${id}`),
  ),
);

const sameSet = <T>(left: Set<T>, right: Set<T>): boolean =>
  left.size === right.size && [...left].every((value) => right.has(value));

const invariant: (condition: boolean, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};

/**
 * A capture identity includes the logical state key. It is therefore
 * impossible for one capture to count toward two additional state IDs.
 */
export const assertNoCaptureSatisfiesTwoStates = (
  entries: readonly Readonly<{ captureKey: string; stateId: string }>[],
): void => {
  const stateIdsByCapture = new Map<string, string>();

  for (const entry of entries) {
    const previousStateId = stateIdsByCapture.get(entry.captureKey);
    invariant(
      previousStateId === undefined || previousStateId === entry.stateId,
      `capture ${entry.captureKey} satisfies multiple state IDs`,
    );
    stateIdsByCapture.set(entry.captureKey, entry.stateId);
  }
};

/**
 * Validate the immutable manifest's exact reviewed shape. This is called at
 * module load and remains exported so later parity stages can validate any
 * derived manifest before they capture it.
 */
export const assertManifestIntegrity = (
  manifest: readonly ManifestEntry[] = PARITY_MANIFEST,
): void => {
  const primary = manifest.filter(
    (entry): entry is PrimaryManifestEntry => entry.kind === 'primary',
  );
  const additional = manifest.filter(
    (entry): entry is AdditionalManifestEntry => entry.kind === 'additional',
  );
  const keys = manifest.map(({ key }) => key);
  const primaryKeys = unique(primary.map(({ key }) => key));
  const additionalKeys = unique(additional.map(({ key }) => key));

  invariant(
    primary.length === PRIMARY_CASE_COUNT,
    'expected exactly 306 primary cases',
  );
  invariant(
    additional.length === ADDITIONAL_CASE_COUNT,
    'expected exactly 240 additional cases',
  );
  invariant(
    manifest.length === LOGICAL_CASE_COUNT,
    'expected exactly 546 logical cases',
  );
  invariant(
    unique(keys).size === keys.length,
    'manifest contains duplicate keys',
  );
  invariant(
    sameSet(primaryKeys, expectedPrimaryKeys),
    'primary keys do not match the Cartesian product',
  );
  invariant(
    sameSet(additionalKeys, expectedAdditionalKeys),
    'additional keys do not match the reviewed state expansion',
  );

  const stateIds = unique(
    ADDITIONAL_STATE_ASSIGNMENTS.map(({ stateId }) => stateId),
  );
  invariant(
    stateIds.size === ADDITIONAL_STATE_ASSIGNMENTS.length,
    'additional state assignments contain duplicate state IDs',
  );
  invariant(stateIds.size === 40, 'expected exactly 40 additional state IDs');

  for (const assignment of ADDITIONAL_STATE_ASSIGNMENTS) {
    const stateCases = additional.filter(
      ({ stateId }) => stateId === assignment.stateId,
    );
    const familyWidths = unique(
      stateCases.map(({ family, width }) => `${family}:${width}`),
    );
    invariant(
      stateCases.length === PARITY_PALETTES.length,
      `state ${assignment.stateId} must run six times`,
    );
    invariant(
      familyWidths.size === 1,
      `state ${assignment.stateId} has multiple family/width assignments`,
    );
    invariant(
      familyWidths.has(`${assignment.family}:${assignment.width}`),
      `state ${assignment.stateId} has the wrong family/width assignment`,
    );
  }

  assertNoCaptureSatisfiesTwoStates(
    additional.map(({ captureKey, stateId }) => ({ captureKey, stateId })),
  );
};

export type ParityComparison = Readonly<{
  manifestKey: ManifestEntry['key'];
  entry: ManifestEntry;
  repetition: number;
}>;

/**
 * Expand execution repetitions without mutating or extending the logical
 * manifest. Every comparison retains the same manifest key as its source case.
 */
export const comparisonsForRepetitions = (
  repetitions: number = PARITY_REPETITIONS,
): readonly ParityComparison[] => {
  if (repetitions !== PARITY_REPETITIONS) {
    throw new RangeError('parity manifest requires exactly three repetitions');
  }

  return Object.freeze(
    Array.from({ length: repetitions }, (_, repetitionIndex) =>
      PARITY_MANIFEST.map((entry) =>
        Object.freeze({
          manifestKey: entry.key,
          entry,
          repetition: repetitionIndex + 1,
        }),
      ),
    ).flat(),
  );
};

assertManifestIntegrity();
invariant(
  PARITY_COUNTS.primary === PRIMARY_CASE_COUNT &&
    PARITY_COUNTS.additional === ADDITIONAL_CASE_COUNT &&
    PARITY_COUNTS.logical === LOGICAL_CASE_COUNT &&
    PARITY_COUNTS.comparisons === COMPARISON_COUNT,
  'parity manifest arithmetic is not exact',
);
