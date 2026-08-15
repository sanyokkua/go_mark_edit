import { buildParityAccountingReport } from './accounting';
import {
  ACCOUNTING_REPORT_PATH,
  buildRecordedStateCoverageReport,
  readRecordedCaptures,
  readRecordedStateCoverage,
  writeParityAccountingReport,
} from './accounting-io';

/**
 * FR-FT-051: "a state with no covering assertion MUST fail closed."
 *
 * This is the rule made executable. It was a markdown table, and the table's
 * own evidence cited a test that had been deleted, while the per-state switch it
 * described was reachable for two of forty states. Nothing could go red.
 *
 * Guarded on its own records rather than the capture log, and deliberately not
 * folded into the guard below: `real-files-parity.test.ts` runs in the
 * `chromium` project while the capture producer runs in `parity`, so a run
 * filtered to one project records one dimension and not the other. Sharing a
 * guard would let a `--project=parity` run skip this check silently, which is
 * the shape of hole being closed.
 *
 * Zero records means this dimension did not run at all — a `-g` filter, or a
 * project-filtered run — and the previous state stands, exactly as the capture
 * guard treats zero captures. One or more records means the dimension ran, and
 * then every planned state must be covered.
 */
async function assertEveryStateWasCovered(): Promise<void> {
  const records = await readRecordedStateCoverage();
  if (records.length === 0) {
    console.log(
      '[parity states] no state coverage recorded this run — the additional-state gate did not run',
    );
    return;
  }
  const coverage = await buildRecordedStateCoverageReport();
  if (coverage.uncovered.length > 0) {
    throw new Error(
      `[parity states] ${coverage.uncovered.length} of ${coverage.planned} additional states ` +
        `have no covering assertion that ran: ${coverage.uncovered.join(', ')}. ` +
        'FR-FT-051 requires a state with no covering assertion to fail closed. ' +
        'Add the assertion, or remove the state from ADDITIONAL_STATE_ASSIGNMENTS ' +
        'with the owner decision that reduction needs (T151).',
    );
  }
  console.log(
    `[parity states] ${coverage.covered}/${coverage.planned} additional states covered by a named assertion`,
  );
}

/**
 * Turn the run's capture log into the committed accounting report.
 *
 * Guarded on purpose: a run that never executed the `parity` project — say
 * `playwright test --project=chromium`, or a single behavioural file — records
 * nothing, and overwriting a real report with an all-zero one would destroy
 * evidence rather than produce it. In that case the previous report stands and
 * the reason is printed.
 */
export default async function globalTeardown(): Promise<void> {
  await assertEveryStateWasCovered();
  const captures = await readRecordedCaptures();
  if (captures.length === 0) {
    console.log(
      '[parity accounting] no parity captures recorded this run — leaving the existing report untouched',
    );
    return;
  }
  /*
   * Built before it is written, because an incomplete run must not overwrite
   * the committed report. T054's outcome clause is that "no aggregate gate can
   * claim completion when any state row is missing or unpaired", and until now
   * an unpaired row was only printed. Two runs reach here with captures but
   * without the whole contract — a `-g`-filtered parity run, and one where a
   * case passed without recording its capture — and both would previously have
   * replaced a complete measurement with a partial one and still exited 0.
   *
   * A failed comparison is deliberately not guarded here: it already fails its
   * own Playwright case, so the run is red before teardown. Only the silent
   * case needs a guard.
   */
  const pending = buildParityAccountingReport(captures);
  if (pending.unaccounted.length > 0) {
    const missing = pending.unaccounted
      .slice(0, 5)
      .map((row) => `${row.manifestKey} repetition ${row.repetition}`)
      .join(', ');
    throw new Error(
      `[parity accounting] ${pending.unaccounted.length} of ` +
        `${pending.contract.plannedVerifications} planned verifications were never ` +
        `attempted, so this run does not cover the contract and the committed ` +
        `report at ${ACCOUNTING_REPORT_PATH} was left untouched. ` +
        `First missing: ${missing}. ` +
        `Run the whole parity project (\`--project=parity\` with no -g filter) to regenerate it.`,
    );
  }

  const report = await writeParityAccountingReport();
  const { totals, contract } = report;
  console.log(
    `[parity accounting] ${totals.attempted}/${contract.plannedVerifications} planned verifications attempted, ` +
      `${totals.passed} passed, ${totals.failed} failed, ${report.unaccounted.length} unaccounted → ${ACCOUNTING_REPORT_PATH}`,
  );
}
