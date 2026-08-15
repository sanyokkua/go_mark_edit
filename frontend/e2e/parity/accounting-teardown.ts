import { buildParityAccountingReport } from './accounting';
import {
  ACCOUNTING_REPORT_PATH,
  readRecordedCaptures,
  writeParityAccountingReport,
} from './accounting-io';

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
