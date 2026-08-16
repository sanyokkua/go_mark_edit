import { accountParityComparisons } from './evidence';

/*
 * T150. `spec.md` Session 2026-08-14 strengthened FR-FT-056: a production-only
 * artifact carrying `comparisonAttempted: false` "is now forbidden outright
 * rather than merely uncountable". Forbidden outright means the field cannot be
 * written at all, so the proof is that no writer in the parity harness emits it
 * — not that its value happens to be `true` everywhere today. Whether a
 * comparison ran is carried by the `status` discriminant instead:
 * `pairing-mismatch` is the one state in which it did not.
 *
 * `targeted-parity.test.ts` is a Playwright file that Jest cannot import (it
 * calls `test()` at module scope against the Playwright runner), so this reads
 * its source, exactly as the repetition-count cross-check in
 * `accounting.test.ts` reads `playwright.config.ts`.
 */
// Proves: FR-FT-056 (partial — only the prohibition on a `comparisonAttempted`
//   artifact; the reference-variant clauses are proven by reference-adapter.test.ts)
it('T150 leaves no comparisonAttempted field for any parity artifact to carry', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile('e2e/targeted-parity.test.ts', 'utf8');

  expect(source).not.toContain('comparisonAttempted');
  expect(source).not.toContain('comparison_attempted');
  expect(source).toContain("status: 'pairing-mismatch'");
});

it('accounts an unattempted, completed, and unresolved comparison separately', () => {
  expect(
    accountParityComparisons(
      [
        { manifestKey: 'case-a', repetition: 1 },
        { manifestKey: 'case-a', repetition: 2 },
        { manifestKey: 'case-b', repetition: 1 },
      ],
      [
        {
          manifestKey: 'case-a',
          repetition: 1,
          referenceReady: true,
          actualReady: true,
          comparisonCompleted: true,
          status: 'passed',
        },
        {
          manifestKey: 'case-a',
          repetition: 2,
          referenceReady: true,
          actualReady: true,
          comparisonCompleted: true,
          status: 'failed',
        },
      ],
    ),
  ).toEqual([
    {
      manifestKey: 'case-a',
      repetition: 1,
      planned: true,
      attempted: true,
      referenceReady: true,
      actualReady: true,
      comparisonCompleted: true,
      passed: true,
      failed: false,
      unresolved: false,
    },
    {
      manifestKey: 'case-a',
      repetition: 2,
      planned: true,
      attempted: true,
      referenceReady: true,
      actualReady: true,
      comparisonCompleted: true,
      passed: false,
      failed: true,
      unresolved: false,
    },
    {
      manifestKey: 'case-b',
      repetition: 1,
      planned: true,
      attempted: false,
      referenceReady: false,
      actualReady: false,
      comparisonCompleted: false,
      passed: false,
      failed: false,
      unresolved: false,
    },
  ]);
});
