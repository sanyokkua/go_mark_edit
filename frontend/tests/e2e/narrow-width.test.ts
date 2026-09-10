import { expect, test } from '../support/harness';

test('keeps toolbar overflow and tab scrolling reachable at narrow widths', async ({
  app,
}) => {
  await app.launch();

  const { page } = app;
  await page.setViewportSize({ width: 1280, height: 720 });
  for (let index = 0; index < 7; index += 1) {
    await page.getByRole('button', { name: 'New tab' }).click();
  }

  const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
  const tabsBar = page.getByRole('group', { name: 'Document tabs' });
  const tablist = page.getByRole('tablist', { name: 'Document tabs' });

  for (const width of [375, 768] as const) {
    await page.setViewportSize({ width, height: 720 });

    await expect(toolbar).toHaveAttribute('data-bar-overflow', 'menu');
    await expect(toolbar).toHaveAttribute('data-bar-overflowing', 'true');
    const overflowTrigger = toolbar.getByRole('button', {
      name: 'More actions',
    });
    await expect(overflowTrigger).toBeVisible();
    await overflowTrigger.click();
    const overflowPopup = page.locator(
      '[data-viewport-popup="editor-overflow"]',
    );
    await expect(overflowPopup).toBeVisible();
    await expect(
      overflowPopup.getByRole('menuitem', { name: 'Link', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overflowPopup).toHaveCount(0);

    await expect(tabsBar).toHaveAttribute('data-bar-overflow', 'scroll');
    await expect(tablist).toBeVisible();
    await expect
      .poll(() =>
        tablist.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
});
