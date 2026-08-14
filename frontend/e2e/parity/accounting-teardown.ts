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
  const report = await writeParityAccountingReport();
  const { totals, contract } = report;
  console.log(
    `[parity accounting] ${totals.attempted}/${contract.plannedVerifications} planned verifications attempted, ` +
      `${totals.passed} passed, ${totals.failed} failed, ${report.unaccounted.length} unaccounted → ${ACCOUNTING_REPORT_PATH}`,
  );
}
