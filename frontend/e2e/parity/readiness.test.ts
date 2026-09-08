import type { Locator } from '@playwright/test';

import {
  PARITY_FREEZE_STYLE,
  captureWhenStable,
  freezeParityPixels,
} from './readiness';

/*
 * Jest owns this file. `frontend/jest.config.mjs` matches
 * `e2e/parity/ ** /*.test.ts` recursively while `frontend/playwright.config.ts`
 * matches `e2e/*.test.ts` at the top level only — a readiness test placed one
 * directory up would be claimed by Playwright and kill the whole run at
 * collection, which is exactly what happened to `e2e/parity/` between T034 and
 * 2026-08-14.
 *
 * `readiness.ts` is the machinery FR-FT-054's determinism clauses live in, and
 * until now nothing tested it. The parity suite *exercised* it three times per
 * case: if `captureWhenStable` had silently accepted the first raster, or
 * `PARITY_FREEZE_STYLE` had stopped hiding Monaco's own cursor element, the
 * run would have gone on passing whenever the noise happened not to bite —
 * which is precisely the failure mode the clause was written after. A
 * precondition that is only exercised is not asserted.
 */

/**
 * A Locator stand-in that returns a scripted sequence of rasters.
 *
 * Hashing is real — `captureWhenStable` runs SHA-256 over the bytes — so equal
 * buffers really do produce equal hashes here, and the sequence below is read
 * the same way the browser's would be.
 */
function scriptedLocator(frames: readonly string[]): {
  readonly locator: Locator;
  readonly shots: () => number;
  readonly waits: () => number;
} {
  let index = 0;
  let waits = 0;
  const page = {
    waitForTimeout: async (): Promise<void> => {
      waits += 1;
    },
  };
  const locator = {
    screenshot: async (): Promise<Buffer> => {
      const frame = frames[Math.min(index, frames.length - 1)] ?? '';
      index += 1;
      return Buffer.from(frame, 'utf8');
    },
    page: () => page,
  } as unknown as Locator;
  return { locator, shots: (): number => index, waits: (): number => waits };
}

// Proves: FR-FT-054 — "a capture MUST be taken only once the region has stopped
// changing — three consecutive identical hashes, as a precondition rather than
// a property checked afterwards".
//
// Three, specifically. Two consecutive matches is the cheap version and it is
// not enough: the measurement on 2026-08-14 found the editor region changing
// four times over its first ~1.2 seconds, so a pair of equal rasters is an
// ordinary event during settling, not evidence of settling.
it('T157 requires three consecutive identical rasters, not two', () => {
  const settled = scriptedLocator(['a', 'b', 'b', 'b']);

  return captureWhenStable(settled.locator, { intervalMs: 0 }).then(
    (result) => {
      expect(result.buffer.toString('utf8')).toBe('b');
      // One shot for 'a', then three for the run of 'b': the third match is
      // what ends it, so a two-match rule would have stopped one shot earlier.
      expect(result.attempts).toBe(4);
      expect(result.observedHashes).toHaveLength(2);
    },
  );
});

// Proves: FR-FT-054 — the same clause, from the side that makes "consecutive"
// mean something: a run broken by one differing raster must start over rather
// than accumulate matches across the change.
it('T157 restarts the run when the region changes again mid-count', async () => {
  const restarted = scriptedLocator(['a', 'b', 'b', 'c', 'c', 'c']);

  const result = await captureWhenStable(restarted.locator, { intervalMs: 0 });

  expect(result.buffer.toString('utf8')).toBe('c');
  expect(result.attempts).toBe(6);
  expect(result.observedHashes).toHaveLength(3);
});

// Proves: FR-FT-054 — "as a precondition rather than a property checked
// afterwards". The distinction is only observable in the failing case: a
// post-hoc check reports a mismatch and hands back a raster anyway, and the
// comparison that follows cannot tell drift from noise. This must refuse to
// produce a capture at all.
it('T157 refuses to return a capture from a region that never settles', async () => {
  const never = scriptedLocator(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  let elapsed = 0;
  const clock = jest
    .spyOn(Date, 'now')
    .mockImplementation((): number => (elapsed += 50));

  try {
    await expect(
      captureWhenStable(never.locator, { intervalMs: 0, timeoutMs: 120 }),
    ).rejects.toThrow(/never stabilised within 120ms/);
  } finally {
    clock.mockRestore();
  }
});

// Proves: FR-FT-054 — "A **frozen caret** is among the conditions the capture
// MUST hold fixed, and freezing it MUST cover an editor that draws its own
// cursor element rather than relying on a native caret."
//
// Two separate rules, and the second is the one that was measured wrong:
// `caret-color` does not apply to Monaco's `div.cursor`, which blinks by
// toggling `visibility` from JavaScript, so `animation-duration: 0ms` has
// nothing to freeze either. The parity run exercised both declarations without
// asserting either, so deleting the Monaco rule would have reintroduced the
// 46-pixel coin flip in `tab-dirty` and `tab-autosave-in-flight` silently.
it('T157 freezes both the native caret and an editor-drawn cursor element', () => {
  const declarations = PARITY_FREEZE_STYLE.replace(/\s+/g, ' ');

  expect(declarations).toContain('caret-color: transparent !important');
  expect(declarations).toMatch(
    /\.monaco-editor \.cursor \{ visibility: hidden !important; \}/,
  );
  expect(declarations).toContain('animation-duration: 0ms !important');
  expect(declarations).toContain('transition-duration: 0ms !important');
  expect(declarations).toContain('scroll-behavior: auto !important');
});

// Proves: FR-FT-054 — "Readiness MUST be asserted before capture". The freeze
// is part of that readiness, and it must be idempotent: the parity cases
// re-prepare the same page between surfaces, and a second style tag would
// stack duplicate `!important` rules whose cascade order is not the harness's
// to reason about.
it('T157 installs the freeze exactly once per page', async () => {
  let tags = 0;
  const style = {
    evaluate: async (): Promise<void> => undefined,
  };
  const page = {
    locator: (selector: string) => {
      expect(selector).toBe('style[data-parity-freeze]');
      return { count: async (): Promise<number> => tags };
    },
    addStyleTag: async (options: { content: string }) => {
      expect(options.content).toBe(PARITY_FREEZE_STYLE);
      tags += 1;
      return style;
    },
    evaluate: async (): Promise<void> => undefined,
  } as unknown as Parameters<typeof freezeParityPixels>[0];

  await freezeParityPixels(page);
  await freezeParityPixels(page);

  expect(tags).toBe(1);
});
