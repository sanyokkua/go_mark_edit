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
