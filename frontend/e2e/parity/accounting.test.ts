import {
  behaviourVerifiedKeys,
  buildParityStateCoverageReport,
  emptyRunVerdict,
  isContinuousIntegrationRun,
  PARITY_REPETITION_COUNT,
  pixelComparedKeys,
  plannedParityVerifications,
  plannedStateCoverage,
  verificationMethodForKey,
} from './accounting';
import { ADDITIONAL_STATE_ASSIGNMENTS } from './manifest';

/*
 * `PARITY_REPETITION_COUNT` describes the runner rather than restating a number,
 * so it must be asserted against the runner or it becomes the very defect this
 * clean-up has been closing: a value whose only reader is its own test.
 *
 * The authoritative check is in `targeted-parity.test.ts`, which asserts
 * `testInfo.project.repeatEach` — the value Playwright is *actually* running
 * with, not the value the config file happens to contain. Jest cannot import
 * `playwright.config.ts` (it is outside this tsconfig's build graph), so the
 * cross-check here is on the config source text, and the runtime one carries
 * the weight.
 */
it('repetition count matches the parity project declared in the config source', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile('playwright.config.ts', 'utf8');

  expect(source).toContain("name: 'parity'");
  expect(source).toContain(`repeatEach: ${PARITY_REPETITION_COUNT}`);
  expect(source).toContain("testMatch: 'e2e/targeted-parity.test.ts'");
});

it('plans every key of the amended contract in every repetition', () => {
  expect(pixelComparedKeys()).toHaveLength(13);
  expect(behaviourVerifiedKeys()).toHaveLength(36);
  expect(new Set(pixelComparedKeys()).size).toBe(13);
  expect(new Set(behaviourVerifiedKeys()).size).toBe(36);

  const planned = plannedParityVerifications();
  /*
   * 13 pixel-compared keys, not 14. T173 removed
   * `targeted:settings-overflow:375:minimal-light` when the overflow interior
   * became a named reviewed exclusion, so the contract is 147 verifications
   * rather than 150. Recorded here rather than silently lowered: a falling
   * parity count is exactly the shape T151's fail-closed rule exists to catch.
   */
  expect(planned).toHaveLength((13 + 36) * PARITY_REPETITION_COUNT);

  // Every key appears exactly once per repetition, and no key appears twice.
  for (const key of [...pixelComparedKeys(), ...behaviourVerifiedKeys()]) {
    const rows = planned.filter(({ manifestKey }) => manifestKey === key);
    expect(rows.map(({ repetition }) => repetition).sort()).toEqual([1, 2, 3]);
  }
  expect(
    new Set(
      planned.map(
        ({ manifestKey, repetition }) => `${manifestKey}:${repetition}`,
      ),
    ).size,
  ).toBe(planned.length);
});

it('classifies every planned key by exactly one verification method', () => {
  for (const key of pixelComparedKeys()) {
    expect(verificationMethodForKey(key)).toBe('pixel-comparison');
  }
  for (const key of behaviourVerifiedKeys()) {
    expect(verificationMethodForKey(key)).toBe('behaviour');
  }

  // The two sets must not overlap — a key counted twice would inflate the report.
  const overlap = pixelComparedKeys().filter((key) =>
    behaviourVerifiedKeys().includes(key),
  );
  expect(overlap).toEqual([]);
  expect(
    verificationMethodForKey('primary:editor-split:1280:glass-light'),
  ).toBe(undefined);
});

/*
 * T120. FR-FT-051 requires a state with no covering assertion to fail closed,
 * and until now the enforcement was a markdown table whose own evidence cited a
 * deleted test. These pin the two ways a state can lack an assertion, because a
 * gate that cannot go red is the defect being fixed.
 */
// Proves: FR-FT-051
it('FR-FT-051 plans every additional state exactly once', () => {
  const planned = plannedStateCoverage();
  expect(planned).toHaveLength(ADDITIONAL_STATE_ASSIGNMENTS.length);
  expect(new Set(planned).size).toBe(planned.length);
  expect([...planned].sort()).toEqual(
    [...ADDITIONAL_STATE_ASSIGNMENTS.map(({ stateId }) => stateId)].sort(),
  );
});

// Proves: FR-FT-051
it('FR-FT-051 reports a state whose assertion never ran as uncovered', () => {
  const planned = plannedStateCoverage();
  const covered = planned
    .slice(1)
    .map((stateId) => ({ stateId, assertion: `asserted ${stateId}` }));

  const report = buildParityStateCoverageReport(covered);

  expect(report.planned).toBe(planned.length);
  expect(report.covered).toBe(planned.length - 1);
  expect(report.uncovered).toEqual([planned[0]]);
});

// Proves: FR-FT-051
it('FR-FT-051 refuses a state that names no assertion', () => {
  // The `control-hovered` shape: the case ran, drove a hover and proved nothing.
  // A record with an empty name must not count as coverage.
  const planned = plannedStateCoverage();
  const covered = planned.map((stateId, index) => ({
    stateId,
    assertion: index === 0 ? '   ' : `asserted ${stateId}`,
  }));

  const report = buildParityStateCoverageReport(covered);

  expect(report.uncovered).toEqual([planned[0]]);
  expect(report.covered).toBe(planned.length - 1);
});

// Proves: FR-FT-051
it('FR-FT-051 reports full coverage only when every state named an assertion', () => {
  const covered = plannedStateCoverage().map((stateId) => ({
    stateId,
    assertion: `asserted ${stateId}`,
  }));

  const report = buildParityStateCoverageReport(covered);

  expect(report.uncovered).toEqual([]);
  expect(report.covered).toBe(report.planned);
  expect(report.rows).toHaveLength(report.planned);
});

/*
 * T139. Both teardown guards returned early on zero records, printing a note and
 * exiting 0. That is the right answer for a developer running one file, and the
 * wrong one for CI: an invocation narrowed to `--project=chromium` or a `-g`
 * filter would report success having measured nothing at all — the exact
 * "a gate that exits zero having parsed nothing did not pass" failure
 * `scripts/verify.sh` refuses elsewhere. The verdict is now a decision, and
 * these pin both sides of it.
 */
// Proves: FR-FT-051 (partial — only that a run recording nothing cannot report
// success in CI. Which states are covered is proved by the four cases above.)
it('FR-FT-051 fails closed when a CI run records no state coverage', () => {
  const verdict = emptyRunVerdict('states', { CI: 'true' });

  expect(verdict.failClosed).toBe(true);
  expect(verdict.message).toContain('states');
});

// Proves: FR-FT-051 (partial — the local half of the same decision.)
it('FR-FT-051 lets a narrowed local run record no state coverage', () => {
  const verdict = emptyRunVerdict('states', {});

  expect(verdict.failClosed).toBe(false);
  expect(verdict.message).toContain('did not run');
});

// Proves: SC-FT-012 (partial — only that an accounting run recording no capture
// cannot report success in CI; the 150-verification contract itself is proved by
// `plannedParityVerifications` above and by the run's own teardown.)
it('SC-FT-012 fails closed when a CI run records no parity capture', () => {
  expect(emptyRunVerdict('accounting', { CI: '1' }).failClosed).toBe(true);
  expect(emptyRunVerdict('accounting', {}).failClosed).toBe(false);
});

// Proves: SC-FT-012 (partial — the environment reading only.)
it('SC-FT-012 treats only a non-empty CI variable as continuous integration', () => {
  expect(isContinuousIntegrationRun({ CI: 'true' })).toBe(true);
  expect(isContinuousIntegrationRun({ CI: '' })).toBe(false);
  expect(isContinuousIntegrationRun({})).toBe(false);
});
