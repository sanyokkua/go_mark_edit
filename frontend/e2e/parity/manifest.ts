/**
 * This manifest is a **reference-navigation index**, not a comparison contract.
 *
 * The whole-screen contract these keys once expressed — 306 primary
 * family/width/palette cases plus 240 additional state cases, repeated three
 * times for 1,638 comparisons — was withdrawn by spec.md Clarifications →
 * Session 2026-08-14 and the amended FR-FT-051, because the binding depicts the
 * product's final state while this feature delivers a subset. The runner that
 * consumed the pixel-compared half was removed in f9a34a7b. Nothing compares 510
 * keys any more, so every declaration that described only that run is gone with
 * it: `PARITY_REPETITIONS`, `COMPARISON_COUNT`, `VERIFICATION_COUNT`,
 * `PIXEL_COMPARED_CASE_COUNT`, `PIXEL_COMPARISON_COUNT`,
 * `BEHAVIOUR_VERIFICATION_COUNT`, `PIXEL_COMPARED_MANIFEST`, `PARITY_COUNTS`,
 * `comparisonsForRepetitions` and the `ParityComparison` type. Repetition is now
 * a capture precondition rather than a suite-level loop — FR-FT-054's three
 * identical hashes are enforced by `captureWhenStable` in `readiness.ts`.
 *
 * The contract that replaced it lives elsewhere: the 14 pixel-compared component
 * keys in `../targeted-manifest.ts`, and the behaviour-verified status keys
 * declared below.
 *
 * **How much of the 546 is live: 58 keys. The other 488 are resolved by
 * nothing.** That is measured, not asserted — `RESOLVED_MANIFEST_KEYS` at the
 * foot of this file is the union of the three selections below, every one of
 * which is the value its Playwright case actually navigates, and
 * `manifest.test.ts` pins the total. The three:
 *
 *   - **14 primary probes.** `T050_REFERENCE_PROBES` looks up one entry per
 *     mapped screen by `(family, width, palette)` to drive reference navigation
 *     before capture, spanning all three widths and all six palettes.
 *   - **4 `empty`-family entries.** `T057_LAUNCHER_ENTRIES` takes the
 *     `minimal-light` launcher cases at 1280 and 375: two primary, plus the two
 *     **additional** launcher assignments (`launcher-first-run`,
 *     `launcher-six-file`).
 *   - **40 additional states.** `additionalStateEntries()` resolves one entry
 *     per `ADDITIONAL_STATE_ASSIGNMENTS` row for the T120 state gate, which
 *     FR-FT-051 requires to fail closed on any state with no covering
 *     assertion. This is why the 40-row state table must stay enumerable.
 *
 * They do not overlap: T057 names its two launcher states at `minimal-light`
 * while the T120 gate names every state at the first palette, `glass-light`,
 * and an additional key is `state:<stateId>:<palette>`.
 *
 * **The figure this replaces was 18, and it was wrong.** It counted the 14
 * probes and the 4 launcher entries, and it predates T120, which added the
 * other 40 — so the T151 task text and the owner decision that both quote "18
 * of 546" are superseded by this measurement. Saying so in full is the point of
 * the task: a comment that quietly restates a stale number is worse than no
 * comment, because it reads as a measurement and is not one.
 *
 * **Why the 488 survive anyway** (owner decision, 2026-08-16, `tasks.md` T151
 * and `specs/003-real-files-and-tabs/decisions-phase-21.md`): reducing the
 * index is a larger change than it looks — 306, 240 and 546 are asserted at
 * module load here and cross-read by `../targeted-manifest.ts` and
 * `./state-contract.test.ts` to prove no targeted comparison key has leaked in,
 * and the T120 gate needs the state list enumerable. So 306, 240 and 546 are
 * the sizes of an index, not a claim that 546 screens are compared.
 */
export const PARITY_HEIGHT = 720 as const;
export const PRIMARY_CASE_COUNT = 306 as const;
export const ADDITIONAL_CASE_COUNT = 240 as const;
export const LOGICAL_CASE_COUNT = 546 as const;

/**
 * spec.md, Session 2026-08-14. No `editor-status` state can be pixel-compared,
 * and the reason is structural rather than a matter of finding the right
 * reference condition.
 *
 * Four of the six (`saved`, `autosaved`, `unsaved-changes`, `read-only`) differ
 * only in a save status the binding never draws in its status row at all — it
 * puts it in the title bar (`mockup.html:594`).
 *
 * The other two do name a condition the binding's row draws (`.sb-eol` for the
 * line ending, `.sb-count` for the size), and reviewed reference variants for
 * both exist in `reference-adapter.ts`. Measuring through them is what proved
 * they still cannot pair on absolute bounds: the binding's row carries a
 * Problems badge, an AI-provider readout and a Reading pill, while production
 * carries a `Document details` disclosure the binding lacks. Production may not
 * add the provider readout (FR-FT-049 defers Assistant/provider behaviour), and
 * writing a Details pill into the reference would fabricate binding content
 * rather than adapt it. The binding also draws `.statusbar` full width beneath
 * the sidebar while production draws it inside the document area, which is the
 * approved T042 placement. Measured at 1280 Minimal Light: 115.531px and
 * 207.453px horizontally, and a 46px frame-height difference vertically. Those
 * offsets are permanent, so every status item lands on a different sub-pixel
 * grid and no picture of one can be compared to a picture of the other.
 *
 * All six are proven by behaviour assertion instead. `targeted-manifest.ts`
 * reads this list to fail any targeted comparison case that names one of them,
 * and `targeted-parity.test.ts` T063 is the test that asserts them against
 * `data-status-state`, the title bar, the status-item text and the binding
 * colour token.
 */
export const BEHAVIOUR_VERIFIED_STATE_IDS = Object.freeze([
  'status-saved',
  'status-autosaved',
  'status-unsaved-changes',
  'status-read-only',
  'status-mixed-ending',
  'status-large-file',
] as const);

/**
 * FR-FT-051, SC-FT-009 and SC-FT-012 each declare 36 behaviour-verified keys —
 * the six states above across the six palettes. `targeted-parity.test.ts` T063
 * executes all 36, one test per palette, and writes a semantic/metrics/status
 * evidence set per key under `evidence/ft-vs-08/parity/targeted/editor-status/`.
 */
export const BEHAVIOUR_VERIFIED_CASE_COUNT = 36 as const;

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

/**
 * A logical key is behaviour-verified when its state ID names one of the six
 * editor-status states.
 */
export const isBehaviourVerifiedEntry = (entry: ManifestEntry): boolean =>
  entry.kind === 'additional' &&
  (BEHAVIOUR_VERIFIED_STATE_IDS as readonly string[]).includes(entry.stateId);

export const BEHAVIOUR_VERIFIED_MANIFEST = Object.freeze(
  PARITY_MANIFEST.filter(isBehaviourVerifiedEntry),
);

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
 * Validate the navigation index's exact reviewed shape. FR-FT-051 requires that
 * duplicate, missing, extra or multiply counted keys fail, and T050/T057 resolve
 * their entries by lookup — a missing or duplicated key would make a probe
 * silently navigate to the wrong screen. Called at module load, and exported so
 * a derived index can be validated before it is navigated.
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

assertManifestIntegrity();
invariant(
  BEHAVIOUR_VERIFIED_STATE_IDS.length === 6 &&
    new Set(BEHAVIOUR_VERIFIED_STATE_IDS).size === 6 &&
    BEHAVIOUR_VERIFIED_STATE_IDS.every((stateId) =>
      ADDITIONAL_STATE_ASSIGNMENTS.some(
        (assignment) => assignment.stateId === stateId,
      ),
    ),
  'behaviour-verified state IDs are not six distinct manifest state IDs',
);
invariant(
  BEHAVIOUR_VERIFIED_MANIFEST.length === BEHAVIOUR_VERIFIED_CASE_COUNT,
  'behaviour-verified keys are not six states across six palettes',
);

/*
 * ── What actually resolves an entry out of this index ────────────────────────
 *
 * Three live Playwright cases navigate it, and each one's selection is defined
 * here rather than in the test, so the coverage number in the header comment is
 * measured (`manifest.test.ts`) instead of remembered. A selection defined in
 * the test and re-derived here would be arithmetic over a symbol nothing reads.
 */

/**
 * T050's fourteen primary probes — one per mapped screen, spread across all
 * three widths and all six palettes so a navigation bug in any of them shows up.
 * `real-files-parity.test.ts` drives reference navigation to exactly these.
 */
export const T050_REFERENCE_PROBES = Object.freeze([
  ['editor-split', 1280, 'glass-light'],
  ['editor-split', 768, 'material-dark'],
  ['editor-split', 375, 'minimal-light'],
  ['menu-file', 1280, 'glass-light'],
  ['menu-settings', 768, 'material-dark'],
  ['menu-view', 375, 'minimal-light'],
  ['menu-about', 1280, 'glass-dark'],
  ['save-prompt', 375, 'material-light'],
  ['quit-prompt', 375, 'material-dark'],
  ['reload-prompt', 375, 'minimal-dark'],
  ['settings-appearance', 375, 'glass-light'],
  ['settings-editor', 768, 'material-light'],
  ['settings-markdown', 1280, 'minimal-dark'],
  ['toolbar-overflow', 375, 'glass-dark'],
] as const satisfies readonly (readonly [
  ParityFamily,
  ParityWidth,
  ParityPaletteId,
])[]);

export const T050_PROBE_ENTRIES: readonly PrimaryManifestEntry[] =
  Object.freeze(
    T050_REFERENCE_PROBES.map(([family, width, paletteId]) => {
      const entry = PRIMARY_MANIFEST.find(
        (candidate) =>
          candidate.family === family &&
          candidate.width === width &&
          candidate.palette.id === paletteId,
      );
      invariant(
        entry !== undefined,
        `T050 probe is not a primary manifest case: ${family}:${width}:${paletteId}`,
      );
      return entry;
    }),
  );

/**
 * T057's four file-only launcher entries: the two primary `empty` screens at
 * Minimal Light and the two additional launcher states assigned to that family.
 * This is why the 40-row state table is load-bearing and not only the primaries.
 */
export const T057_LAUNCHER_ENTRIES: readonly ManifestEntry[] = Object.freeze(
  PARITY_MANIFEST.filter(
    (entry) =>
      entry.family === 'empty' &&
      entry.palette.id === 'minimal-light' &&
      (entry.width === 1280 || entry.width === 375),
  ),
);

/**
 * The T120 state gate's forty entries — one per additional state. The palette
 * dimension belongs to the pixel-compared and behaviour-verified key counts,
 * which are accounted separately, so this takes the first entry each state has:
 * `PARITY_PALETTES[0]`, Liquid Glass Light.
 */
export const additionalStateEntries = (): readonly AdditionalManifestEntry[] =>
  ADDITIONAL_STATE_ASSIGNMENTS.map(({ stateId }) => {
    const entry = ADDITIONAL_MANIFEST.find(
      (candidate) => candidate.stateId === stateId,
    );
    invariant(
      entry !== undefined,
      `no manifest entry for additional state ${stateId}`,
    );
    return entry;
  });

/**
 * Every logical key any live consumer resolves. The rest of the index is
 * navigated by nothing — see the header comment for why it is retained anyway.
 */
export const RESOLVED_MANIFEST_KEYS: ReadonlySet<string> = Object.freeze(
  new Set<string>([
    ...T050_PROBE_ENTRIES.map(({ key }) => key),
    ...T057_LAUNCHER_ENTRIES.map(({ key }) => key),
    ...additionalStateEntries().map(({ key }) => key),
  ]),
);
