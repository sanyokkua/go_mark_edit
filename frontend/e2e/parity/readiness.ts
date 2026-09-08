import type { Page } from '@playwright/test';

/*
 * FR-FT-054 lists a **frozen caret** among the conditions a deterministic
 * capture must hold fixed, alongside loaded fonts, resolved palette, fixture
 * data, focus, scroll and overlay state.
 *
 * `caret-color: transparent` freezes the *native* caret and was assumed to
 * cover it. It does not cover Monaco, which draws `div.cursor` and blinks it by
 * toggling `visibility` **from JavaScript** — measured 2026-08-14:
 * `animationName: none`, `animationDuration: 0s`, and `visibility` alternating
 * in lockstep with the region hash. So `animation-duration: 0ms` has nothing to
 * freeze and `caret-color` does not apply. The oscillation is 46 pixels, a
 * 2×23 block, and it made `tab-dirty` and `tab-autosave-in-flight` capture a
 * coin-flip raster on every repetition — those states type into the editor,
 * which focuses it and starts the blink.
 *
 * Hiding it is **not a mask**: a mask conceals a difference between the two
 * pages, whereas this holds fixed a condition the requirement names, on the one
 * page that has a caret at all. The binding has no editor and no caret, so
 * there is nothing on the reference side to conceal.
 */
export const PARITY_FREEZE_STYLE = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0ms !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0ms !important;
  }
  .monaco-editor .cursor {
    visibility: hidden !important;
  }
`;

export interface PageReadinessOptions {
  readonly readySelector?: string;
  readonly timeoutMs?: number;
}

export async function waitForParityReady(
  page: Page,
  options: PageReadinessOptions = {},
): Promise<void> {
  const readySelector = options.readySelector ?? 'body';
  const timeout = options.timeoutMs ?? 10_000;
  await page.waitForLoadState('domcontentloaded', { timeout });
  await page.locator(readySelector).waitFor({ state: 'visible', timeout });
  await page.evaluate(async (): Promise<void> => {
    if (document.fonts !== undefined) await document.fonts.ready;
  });
}

export async function freezeParityPixels(page: Page): Promise<void> {
  const freezeStyle = page.locator('style[data-parity-freeze]');
  if ((await freezeStyle.count()) === 0) {
    const style = await page.addStyleTag({ content: PARITY_FREEZE_STYLE });
    await style.evaluate((element) => {
      (element as HTMLElement).setAttribute('data-parity-freeze', 'true');
    });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.parityFrozen = 'true';
  });
}

export interface StableCaptureOptions {
  /** Identical consecutive captures required. FR-FT-054 names three. */
  readonly consecutive?: number;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
}

export interface StableCaptureResult {
  readonly buffer: Buffer;
  readonly hash: string;
  readonly attempts: number;
  readonly settleMs: number;
  /** Every distinct hash seen, oldest first. One entry means it never moved. */
  readonly observedHashes: readonly string[];
}

/**
 * Capture a region only once it has stopped changing.
 *
 * FR-FT-054 requires that "three consecutive unchanged captures MUST produce
 * identical image hashes". The harness asserted that *after* the fact, across
 * the three repetitions of a case, and reported a failure when it did not hold.
 * That is the wrong end: measured 2026-08-14, the editor region changes **four
 * times over the first ~1.2 seconds** after readiness — `data-status-state` and
 * `data-preview-state` constant throughout, so it is the renderer settling
 * (progressive layout, tokenisation and font measurement), not the application
 * changing state. Whichever raster the capture happened to land on became the
 * measurement, and 138 of 450 manifest keys — 31% — hashed differently across
 * repetitions as a result, while the immutable reference was stable in all 450.
 *
 * A comparison taken against a moving capture cannot distinguish drift from
 * noise, so waiting for stability is a precondition for the measurement being
 * meaningful at all. This changes no tolerance, no mask, no comparator and no
 * coordinate handling: it decides *when* to look, not what counts as a match.
 */
export async function captureWhenStable(
  locator: import('@playwright/test').Locator,
  options: StableCaptureOptions = {},
): Promise<StableCaptureResult> {
  const consecutive = options.consecutive ?? 3;
  const intervalMs = options.intervalMs ?? 120;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const { createHash } = await import('node:crypto');
  const startedAt = Date.now();
  const observedHashes: string[] = [];

  let buffer = await locator.screenshot({ animations: 'disabled' });
  let hash = createHash('sha256').update(buffer).digest('hex');
  observedHashes.push(hash);
  let run = 1;
  let attempts = 1;

  while (run < consecutive) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `capture never stabilised within ${timeoutMs}ms after ${attempts} attempts; ` +
          `distinct hashes seen: ${observedHashes.length} (${observedHashes
            .map((value) => value.slice(0, 10))
            .join(' -> ')})`,
      );
    }
    await locator.page().waitForTimeout(intervalMs);
    const next = await locator.screenshot({ animations: 'disabled' });
    attempts += 1;
    const nextHash = createHash('sha256').update(next).digest('hex');
    if (nextHash === hash) {
      run += 1;
      continue;
    }
    observedHashes.push(nextHash);
    buffer = next;
    hash = nextHash;
    run = 1;
  }

  return {
    buffer,
    hash,
    attempts,
    settleMs: Date.now() - startedAt,
    observedHashes,
  };
}

export type ParityScrollOffset = Readonly<{ x: number; y: number }>;

/**
 * FR-FT-054 requires the reference and the application to be captured under an
 * identical scroll state. Both documents are taller than the 720px parity
 * viewport, so any interactive step that brings an element into view (opening a
 * menu, clicking the document area) silently moves every subsequent
 * page-coordinate measurement, and a mid-test scroll reads back as production
 * geometry drift.
 *
 * Record the offset once the page has reached its prepared state, then restore
 * exactly that offset before each capture. This makes the scroll deterministic
 * without changing where either page places its content.
 */
export async function readParityScroll(
  page: Page,
): Promise<ParityScrollOffset> {
  return page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
}

export async function restoreParityScroll(
  page: Page,
  offset: ParityScrollOffset,
): Promise<void> {
  const applied = await page.evaluate((target) => {
    window.scrollTo(target.x, target.y);
    return { x: window.scrollX, y: window.scrollY };
  }, offset);
  if (applied.x !== offset.x || applied.y !== offset.y) {
    throw new Error(
      `Parity capture could not restore scroll ${offset.x},${offset.y}; page reports ${applied.x},${applied.y}`,
    );
  }
}

export async function assertSameOrigin(
  page: Page,
  expectedOrigin: string,
): Promise<void> {
  const actualOrigin = new URL(page.url()).origin;
  if (actualOrigin !== expectedOrigin) {
    throw new Error(
      `Parity page origin changed: expected ${expectedOrigin}, got ${actualOrigin}`,
    );
  }
}
