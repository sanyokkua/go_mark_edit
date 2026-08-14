import {
  behaviourVerifiedKeys,
  PARITY_REPETITION_COUNT,
  pixelComparedKeys,
  plannedParityVerifications,
  verificationMethodForKey,
} from './accounting';

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
  expect(pixelComparedKeys()).toHaveLength(14);
  expect(behaviourVerifiedKeys()).toHaveLength(36);
  expect(new Set(pixelComparedKeys()).size).toBe(14);
  expect(new Set(behaviourVerifiedKeys()).size).toBe(36);

  const planned = plannedParityVerifications();
  expect(planned).toHaveLength((14 + 36) * PARITY_REPETITION_COUNT);

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
