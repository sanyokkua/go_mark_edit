import {
  accountParityComparisons,
  type CapturedParityComparison,
  type ParityComparisonAccounting,
  type PlannedParityComparison,
} from './evidence';
import {
  ADDITIONAL_STATE_ASSIGNMENTS,
  BEHAVIOUR_VERIFIED_MANIFEST,
} from './manifest';
import { allTargetedEntries } from '../targeted-manifest';

/**
 * T054's obligation: report planned / attempted / reference-ready / actual-ready
 * / completed / passed / failed separately, per key, over the amended contract's
 * 14 pixel-compared component keys and 36 behaviour-verified keys.
 *
 * `evidence.ts` has always been able to compute this. Until now nothing called
 * it — its only importer was its own unit test, over synthetic `case-a`/`case-b`
 * keys — so the accounting existed as arithmetic and never as a result.
 *
 * This module is deliberately **pure**: no filesystem, no `import.meta`. Jest
 * owns `e2e/parity/**` and transforms it as CommonJS, where `import.meta` is a
 * syntax error, so keeping the paths and IO in `accounting-io.ts` is what lets
 * the planning and classification logic be unit-tested at all.
 */

/**
 * The `parity` project runs every case three times (`repeatEach: 3` in
 * `playwright.config.ts`). SC-FT-012 requires all three to be accounted for
 * separately, so the planned set is keys × repetitions rather than keys.
 * `targeted-parity.test.ts` asserts `testInfo.project.repeatEach` against this
 * at run time, so it cannot drift from the runner that produces the captures.
 */
export const PARITY_REPETITION_COUNT = 3;

export const pixelComparedKeys = (): readonly string[] =>
  allTargetedEntries().map(({ key }) => key);

export const behaviourVerifiedKeys = (): readonly string[] =>
  BEHAVIOUR_VERIFIED_MANIFEST.map(({ key }) => key);

export type ParityVerificationMethod = 'pixel-comparison' | 'behaviour';

export const verificationMethodForKey = (
  manifestKey: string,
): ParityVerificationMethod | undefined => {
  if (pixelComparedKeys().includes(manifestKey)) return 'pixel-comparison';
  if (behaviourVerifiedKeys().includes(manifestKey)) return 'behaviour';
  return undefined;
};

export function plannedParityVerifications(): readonly PlannedParityComparison[] {
  const keys = [...pixelComparedKeys(), ...behaviourVerifiedKeys()];
  return keys.flatMap((manifestKey) =>
    Array.from({ length: PARITY_REPETITION_COUNT }, (_, index) => ({
      manifestKey,
      repetition: index + 1,
    })),
  );
}

/**
 * FR-FT-051's other half: "Every remaining state in the contract MUST be
 * verified by behaviour assertion, and a state with no covering assertion MUST
 * fail closed."
 *
 * Nothing enforced it. The enforcement was a markdown table, and that table's
 * evidence had evaporated — `evidence/ft-vs-08/phase-18/t084-coverage-rescope.md`
 * grounded a 61-of-61 claim on a `T035` test in `real-files-parity.test.ts` that
 * no longer exists, and on an `establishState` switch under a name that appears
 * nowhere in the file. Meanwhile the real switch was reachable for **two** of
 * forty states. A document cannot fail a build.
 *
 * Planned per **state id**, not per manifest key. The existing dimension is
 * `manifestKey × repetition`; these forty ids expand across six palettes, so
 * folding them in would plan 720 verifications for a contract that needs one
 * covering assertion per state. They are separate dimensions of the same run and
 * are accounted separately.
 */
export const plannedStateCoverage = (): readonly string[] =>
  ADDITIONAL_STATE_ASSIGNMENTS.map(({ stateId }) => stateId);

export type CoveredParityState = Readonly<{
  stateId: string;
  /** The assertion that actually ran, named by the case that ran it. */
  assertion: string;
}>;

export type ParityStateCoverageReport = Readonly<{
  planned: number;
  covered: number;
  uncovered: readonly string[];
  rows: readonly CoveredParityState[];
}>;

export function buildParityStateCoverageReport(
  records: readonly CoveredParityState[],
): ParityStateCoverageReport {
  const planned = plannedStateCoverage();
  const byState = new Map<string, CoveredParityState>();
  for (const record of records) {
    if (record.assertion.trim().length === 0) continue;
    byState.set(record.stateId, record);
  }
  const uncovered = planned.filter((stateId) => !byState.has(stateId));
  return {
    planned: planned.length,
    covered: planned.length - uncovered.length,
    uncovered,
    rows: planned
      .map((stateId) => byState.get(stateId))
      .filter((row): row is CoveredParityState => row !== undefined),
  };
}

export type ParityAccountingReport = Readonly<{
  contract: Readonly<{
    pixelComparedKeys: number;
    behaviourVerifiedKeys: number;
    repetitions: number;
    plannedVerifications: number;
  }>;
  totals: Readonly<Record<string, number>>;
  byMethod: Readonly<
    Record<ParityVerificationMethod, Readonly<Record<string, number>>>
  >;
  methodNotes: Readonly<Record<ParityVerificationMethod, string>>;
  unaccounted: readonly PlannedParityComparison[];
  rows: readonly (ParityComparisonAccounting &
    Readonly<{ method: ParityVerificationMethod | undefined }>)[];
}>;

const tally = (
  rows: readonly ParityComparisonAccounting[],
): Readonly<Record<string, number>> => ({
  planned: rows.length,
  attempted: rows.filter((row) => row.attempted).length,
  referenceReady: rows.filter((row) => row.referenceReady).length,
  actualReady: rows.filter((row) => row.actualReady).length,
  comparisonCompleted: rows.filter((row) => row.comparisonCompleted).length,
  passed: rows.filter((row) => row.passed).length,
  failed: rows.filter((row) => row.failed).length,
  unresolved: rows.filter((row) => row.unresolved).length,
});

export function buildParityAccountingReport(
  captures: readonly CapturedParityComparison[],
): ParityAccountingReport {
  const planned = plannedParityVerifications();
  const accounted = accountParityComparisons(planned, captures);
  const rows = accounted.map((row) => ({
    ...row,
    method: verificationMethodForKey(row.manifestKey),
  }));

  return {
    contract: {
      pixelComparedKeys: pixelComparedKeys().length,
      behaviourVerifiedKeys: behaviourVerifiedKeys().length,
      repetitions: PARITY_REPETITION_COUNT,
      plannedVerifications: planned.length,
    },
    totals: tally(accounted),
    byMethod: {
      'pixel-comparison': tally(
        rows.filter((row) => row.method === 'pixel-comparison'),
      ),
      behaviour: tally(rows.filter((row) => row.method === 'behaviour')),
    },
    methodNotes: {
      'pixel-comparison':
        'A reference region and an actual region are captured and compared at zero tolerance. referenceReady, actualReady and comparisonCompleted all apply.',
      behaviour:
        'referenceReady is always false and that is not a gap: a behaviour-verified key never loads a reference page. spec.md (Session 2026-08-14) records that no picture of the binding status row can pair with production on absolute bounds, so these keys are proven by assertions on data-status-state, the title bar, the status-item text and the binding colour token instead.',
    },
    unaccounted: rows
      .filter((row) => !row.attempted)
      .map(({ manifestKey, repetition }) => ({ manifestKey, repetition })),
    rows,
  };
}

/**
 * The two dimensions a parity run records. Each has its own log, because a run
 * that exercises one and not the other must not read as having covered both.
 */
export type ParityRunDimension = 'states' | 'accounting';

/**
 * True when this process is a continuous-integration run.
 *
 * Takes the environment rather than reading `process.env`, so the decision is
 * testable in both directions without mutating global state.
 */
export const isContinuousIntegrationRun = (
  environment: Readonly<Record<string, string | undefined>>,
): boolean => (environment.CI ?? '').length > 0;

export type EmptyRunVerdict = Readonly<{
  /** Whether recording nothing must end the run non-zero. */
  failClosed: boolean;
  message: string;
}>;

/**
 * What it means for a dimension to have recorded nothing.
 *
 * Locally this is ordinary: `playwright test e2e/window-shell.test.ts` records
 * no parity capture, and `--project=parity` records no state coverage. Ending
 * those runs red would punish the narrow run the repository documents and
 * relies on, and would overwrite a complete committed report with an empty one.
 *
 * In CI it is never ordinary, because CI runs the whole suite by construction.
 * Zero records there means the invocation was narrowed, the setup failed, or a
 * recorder stopped recording — and the gate would otherwise report success
 * having measured nothing. That is precisely what `scripts/baseline.sh` marks
 * `UNRELIABLE` and `scripts/verify.sh` refuses to build on, so this decision
 * makes the same rule hold for the interface gate: **a gate that parsed nothing
 * did not pass.**
 */
export function emptyRunVerdict(
  dimension: ParityRunDimension,
  environment: Readonly<Record<string, string | undefined>>,
): EmptyRunVerdict {
  const label =
    dimension === 'states' ? '[parity states]' : '[parity accounting]';
  const recorded =
    dimension === 'states'
      ? 'no state coverage recorded this run'
      : 'no parity captures recorded this run';
  if (!isContinuousIntegrationRun(environment)) {
    return {
      failClosed: false,
      message:
        dimension === 'states'
          ? `${label} ${recorded} — the additional-state gate did not run`
          : `${label} ${recorded} — the accounting gate did not run, leaving the existing report untouched`,
    };
  }
  return {
    failClosed: true,
    message:
      `${label} ${recorded}, and CI runs the whole suite — so this gate measured nothing ` +
      `and cannot report success. Run \`playwright test\` unfiltered: a \`--project=\` or ` +
      `\`-g\` narrowing silences the ${dimension} dimension entirely.`,
  };
}
