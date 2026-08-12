import type { Page } from '@playwright/test';

export const PARITY_FREEZE_STYLE = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0ms !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0ms !important;
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
