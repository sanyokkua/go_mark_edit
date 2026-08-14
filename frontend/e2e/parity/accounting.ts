import {
  accountParityComparisons,
  type CapturedParityComparison,
  type ParityComparisonAccounting,
  type PlannedParityComparison,
} from './evidence';
import { BEHAVIOUR_VERIFIED_MANIFEST } from './manifest';
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
