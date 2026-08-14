import { resetParityAccounting } from './accounting-io';

/**
 * Truncate the per-run capture log before anything records into it, so an
 * accounting report can never mix two runs together.
 */
export default async function globalSetup(): Promise<void> {
  await resetParityAccounting();
}
