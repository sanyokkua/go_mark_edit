import { expect, test, type Page } from '@playwright/test';

import {
  assertLocalRequests,
  assertShellTiming,
  observeShellRequests,
  type ShellTimingSample,
} from './helpers/shell-observation';

const palettes = [
  ['Liquid Glass', 'Light', 'glass', 'light', '#ffffff6b'],
  ['Liquid Glass', 'Dark', 'glass', 'dark', '#ffffff1a'],
  ['Material', 'Light', 'material', 'light', '#faf8ff'],
  ['Material', 'Dark', 'material', 'dark', '#16161c'],
  ['Minimal', 'Light', 'minimal', 'light', '#fbfbfa'],
  ['Minimal', 'Dark', 'minimal', 'dark', '#141416'],
] as const;

const widths = [375, 768, 1280] as const;

declare global {
  interface Window {
    readonly __GME_STATE_PATCHES__?: readonly unknown[];
    __GME_FRAME_GAP_OBSERVER__?: {
      frameCount: number;
      lastFrameAt: number;
      maxGapMs: number;
    };
  }
}

type FrameGapSampleStart = {
  frameCount: number;
  startedAt: number;
};

async function openAction(page: Page, label: string): Promise<void> {
  const actionBar = page.getByRole('navigation', {
    name: 'Application actions',
  });
  const overflow = actionBar.getByRole('button', { name: 'More actions' });
  if ((page.viewportSize()?.width ?? 1280) <= 376) {
    await expect(overflow).toBeVisible();
    await overflow.click();
    await page.getByRole('menuitem', { name: label }).click();
    return;
  }
  await actionBar.getByRole('button', { name: label, exact: true }).click();
}

async function openSettings(page: Page): Promise<void> {
  await openAction(page, 'Settings');
  /*
   * The binding's compact popup opens the settings screen from its
   * `All settings…` row (`mockup.html:624`); `Appearance` is the popup's group
   * label and its radiogroup name, not a menu item.
   */
  await page.getByRole('menuitem', { name: /All settings/u }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
}

async function expectEditorStageFixtures(
  page: Page,
  width: number,
): Promise<void> {
  const actionBar = page.getByRole('navigation', {
    name: 'Application actions',
  });
  if (width <= 376) {
    const overflow = actionBar.getByRole('button', { name: 'More actions' });
    await overflow.click();
    const overflowMenu = page.getByRole('menu', {
      name: 'More actions',
    });
    expect(await overflowMenu.getByRole('menuitem').allTextContents()).toEqual([
      'File',
      'Settings',
      'View',
      'About',
    ]);
    await page.keyboard.press('Escape');
  } else {
    expect(await actionBar.getByRole('button').allTextContents()).toEqual([
      'File',
      'Settings',
      'View',
      'About',
      '☰',
      '✦',
    ]);
    await expect(
      actionBar.getByRole('button', { name: 'Toggle Assistant' }),
    ).toBeDisabled();
  }

  const tabs = page.getByRole('tablist', { name: 'Document tabs' });
  await expect(tabs).toBeVisible();
  await expect(
    tabs.getByRole('tab', { name: 'release-notes.md' }),
  ).toBeDisabled();
  await expect(tabs.getByRole('tab', { name: 'spec-draft.md' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'New tab' })).toBeDisabled();

  const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
  await expect(
    toolbar.getByRole('button', { name: 'Toggle Assistant' }),
  ).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'Format' })).toBeDisabled();
  await expect(toolbar.getByRole('button', { name: 'Compact' })).toBeDisabled();
  await expect(toolbar.getByRole('button', { name: 'Lint' })).toBeDisabled();
  if (width <= 768) {
    await toolbar.getByLabel('More actions').click();
  }
  await expect(toolbar.getByRole('button', { name: 'Image' })).toBeDisabled();
  if (width <= 376) {
    await expect(
      toolbar.getByRole('radiogroup', { name: 'View arrangement' }),
    ).toBeVisible();
  }
  await page.keyboard.press('Escape');

  await openAction(page, 'File');
  const fileMenu = page.getByRole('menu', { name: 'File' });
  await expect(
    fileMenu.getByRole('menuitem', { name: 'New File' }),
  ).toBeDisabled();
  await expect(
    fileMenu.getByRole('menuitem', { name: 'Open Recent' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');

  if (width > 376) {
    await openAction(page, 'View');
    const viewMenu = page.getByRole('menu', { name: 'View options' });
    await expect(
      viewMenu.getByRole('menuitem', { name: 'Toggle Assistant' }),
    ).toBeDisabled();
    await expect(
      viewMenu.getByRole('menuitem', { name: 'Distraction-free reading' }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
  }

  await openAction(page, 'About');
  const aboutMenu = page.getByRole('menu', { name: 'About' });
  await expect(aboutMenu.getByRole('menuitem')).toHaveCount(4);
  expect(await aboutMenu.getByRole('menuitem').allTextContents()).toEqual([
    'Keyboard shortcuts',
    'Open logs folder',
    'View on GitHub (MIT)',
    'About GoMarkEdit',
  ]);
  await expect(
    aboutMenu.getByRole('menuitem', { name: 'Open logs folder' }),
  ).toBeDisabled();
  await expect(
    aboutMenu.getByRole('menuitem', { name: 'View on GitHub (MIT)' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
}

async function browserNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

async function browserNextFrame(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => resolve(performance.now()));
      }),
  );
}

async function startFrameGapObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (window.__GME_FRAME_GAP_OBSERVER__ !== undefined) {
      return;
    }
    const observer = {
      frameCount: 0,
      lastFrameAt: performance.now(),
      maxGapMs: 0,
    };
    window.__GME_FRAME_GAP_OBSERVER__ = observer;
    const observe = (now: number): void => {
      observer.maxGapMs = Math.max(
        observer.maxGapMs,
        now - observer.lastFrameAt,
      );
      observer.lastFrameAt = now;
      observer.frameCount += 1;
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__GME_FRAME_GAP_OBSERVER__?.frameCount ?? 0),
    )
    .toBeGreaterThanOrEqual(2);
}

async function beginFrameGapSample(page: Page): Promise<FrameGapSampleStart> {
  return page.evaluate(() => {
    const observer = window.__GME_FRAME_GAP_OBSERVER__;
    if (observer === undefined) {
      throw new Error('Frame-gap observer is not installed');
    }
    const startedAt = performance.now();
    observer.lastFrameAt = startedAt;
    observer.maxGapMs = 0;
    return { frameCount: observer.frameCount, startedAt };
  });
}

async function finishFrameGapSample(
  page: Page,
  start: FrameGapSampleStart,
): Promise<number> {
  await browserNextFrame(page);
  await expect
    .poll(() =>
      page.evaluate(() => window.__GME_FRAME_GAP_OBSERVER__?.frameCount ?? 0),
    )
    .toBeGreaterThan(start.frameCount);
  return page.evaluate(() => {
    const observer = window.__GME_FRAME_GAP_OBSERVER__;
    if (observer === undefined) {
      throw new Error('Frame-gap observer is not installed');
    }
    return observer.maxGapMs;
  });
}

async function expectMonacoThemeReady(
  page: Page,
  mode: 'light' | 'dark',
  expectedBackground: string,
): Promise<void> {
  const editor = page.locator('.monaco-editor').first();
  const editorBackground = editor.locator('.monaco-editor-background').first();
  await expect(editor).toBeVisible();
  const expectedComputedBackground = await page.evaluate((background) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = background;
    document.body.append(probe);
    const computed = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return computed;
  }, expectedBackground);
  await expect
    .poll(() =>
      editor.evaluate((element) => element.classList.contains('vs-dark')),
    )
    .toBe(mode === 'dark');
  await expect
    .poll(() =>
      editorBackground.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe(expectedComputedBackground);
  await browserNextFrame(page);
}

async function acknowledgedWorkspaceWidth(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const patches = window.__GME_STATE_PATCHES__ ?? [];
    for (let index = patches.length - 1; index >= 0; index -= 1) {
      const patch = patches[index];
      if (typeof patch !== 'object' || patch === null || !('ui' in patch)) {
        continue;
      }
      const ui = patch.ui;
      if (
        typeof ui === 'object' &&
        ui !== null &&
        'sidebarWidth' in ui &&
        typeof ui.sidebarWidth === 'number'
      ) {
        return ui.sidebarWidth;
      }
    }
    return null;
  });
}

async function statePatchCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__GME_STATE_PATCHES__?.length ?? 0);
}

async function markInputRelease(page: Page): Promise<{
  patchCount: number;
  stoppedAt: number;
}> {
  return page.evaluate(() => ({
    patchCount: window.__GME_STATE_PATCHES__?.length ?? 0,
    stoppedAt: performance.now(),
  }));
}

async function waitForAcknowledgedLayoutAfter(
  page: Page,
  patchCountBeforeInput: number,
  expected: Record<string, number>,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        ({ expectedLayout, minimumPatchCount }) => {
          const patches = window.__GME_STATE_PATCHES__ ?? [];
          return patches.slice(minimumPatchCount).some((patch) => {
            if (
              typeof patch !== 'object' ||
              patch === null ||
              !('ui' in patch)
            ) {
              return false;
            }
            const ui = patch.ui;
            if (typeof ui !== 'object' || ui === null) {
              return false;
            }
            const uiLayout = ui as Record<string, unknown>;
            return Object.entries(expectedLayout).every(
              ([key, value]) => uiLayout[key] === value,
            );
          });
        },
        { expectedLayout: expected, minimumPatchCount: patchCountBeforeInput },
      ),
    )
    .toBe(true);
}

for (const width of widths) {
  for (const [
    themeLabel,
    modeLabel,
    theme,
    mode,
    editorBackground,
  ] of palettes) {
    test(`T026 shell matrix ${width} ${theme} ${mode}`, async ({ page }) => {
      const runtimeErrors: string[] = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 720 });
      await page.goto('/');
      await openSettings(page);
      await expect(
        page.getByRole('dialog', { name: 'Settings' }),
      ).toBeFocused();
      await page.getByRole('radio', { name: themeLabel }).press('Space');
      await page.getByRole('radio', { name: modeLabel }).press('Space');
      await expect(page.getByRole('radio', { name: themeLabel })).toBeChecked();
      await expect(page.getByRole('radio', { name: modeLabel })).toBeChecked();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await expect
        .poll(() =>
          page
            .locator('html')
            .evaluate((element) =>
              getComputedStyle(element).getPropertyValue('--dur-base').trim(),
            ),
        )
        .toBe('0ms');
      await page
        .getByRole('dialog', { name: 'Settings' })
        .getByRole('button', { name: 'Close' })
        .click();

      const workspace = page.getByRole('complementary', { name: 'Workspace' });
      await expect(workspace).toBeVisible();
      await expect
        .poll(async () => (await workspace.boundingBox())?.width)
        .toBe(width === 375 ? 230 : width === 768 ? 46 : 256);
      await expect(
        page.getByRole('main', { name: 'Document area' }),
      ).toBeVisible();
      await expectEditorStageFixtures(page, width);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);

      const toolbar = page.getByLabel('Document toolbar');
      if (width === 375) {
        await expect(
          page.getByRole('button', { name: 'More actions' }),
        ).toBeVisible();
        const editor = await page.getByLabel('Editor pane').boundingBox();
        const preview = await page.getByLabel('Preview pane').boundingBox();
        const document = page.getByRole('main', { name: 'Document area' });
        const documentBounds = await document.boundingBox();
        const toolbarBounds = await toolbar.boundingBox();
        await toolbar.getByLabel('More actions').click();
        const arrangementBounds = await toolbar
          .getByRole('radiogroup', { name: 'View arrangement' })
          .boundingBox();
        await page.keyboard.press('Escape');
        expect(editor).not.toBeNull();
        expect(preview).not.toBeNull();
        expect(documentBounds).not.toBeNull();
        expect(toolbarBounds).not.toBeNull();
        expect(arrangementBounds).not.toBeNull();
        await expect(document).toBeInViewport({ ratio: 1 });
        await expect(toolbar).toBeInViewport({ ratio: 1 });
        expect(documentBounds!.x).toBeGreaterThanOrEqual(0);
        expect(documentBounds!.x + documentBounds!.width).toBeLessThanOrEqual(
          375,
        );
        expect(toolbarBounds!.x).toBeGreaterThanOrEqual(documentBounds!.x);
        expect(toolbarBounds!.x + toolbarBounds!.width).toBeLessThanOrEqual(
          documentBounds!.x + documentBounds!.width,
        );
        expect(arrangementBounds!.x).toBeGreaterThanOrEqual(toolbarBounds!.x);
        expect(
          arrangementBounds!.x + arrangementBounds!.width,
        ).toBeLessThanOrEqual(toolbarBounds!.x + toolbarBounds!.width);
        expect(preview!.y).toBeGreaterThan(editor!.y);
        expect(Math.abs(preview!.x - editor!.x)).toBeLessThanOrEqual(1);
      } else {
        await expect(
          page.getByRole('button', { name: 'More actions' }),
        ).toHaveCount(0);
      }

      await expect
        .poll(() =>
          toolbar.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        )
        .toBe(true);
      await expectMonacoThemeReady(page, mode, editorBackground);
      await page.addStyleTag({
        content:
          '.monaco-editor .cursor, .monaco-editor .decorationsOverviewRuler { visibility: hidden !important; }',
      });
      await expect(page).toHaveScreenshot(
        `window-shell-${width}-${theme}-${mode}.png`,
        {
          animations: 'disabled',
          caret: 'hide',
        },
      );
      expect(runtimeErrors).toEqual([]);
    });
  }
}

test('T039 native minimum frame rounding keeps the workspace off-canvas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 376, height: 480 });
  await page.goto('/');

  const workspace = page.getByRole('complementary', { name: 'Workspace' });
  await expect(workspace).toBeVisible();
  await expect
    .poll(async () => Math.round((await workspace.boundingBox())?.width ?? -1))
    .toBe(230);
  await expect(
    page.getByRole('button', { name: 'More actions' }),
  ).toBeVisible();
});

for (const width of widths) {
  test(`T040 Settings popup stays operable inside the ${width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 480 });
    await page.goto('/');

    await openAction(page, 'Settings');
    const popup = page.getByRole('menu', { name: 'Settings menu' });
    await expect(popup).toBeVisible();
    const popupBounds = await popup.boundingBox();
    expect(popupBounds).not.toBeNull();
    expect(popupBounds!.x).toBeGreaterThanOrEqual(0);
    expect(popupBounds!.x + popupBounds!.width).toBeLessThanOrEqual(width);
    expect(popupBounds!.y).toBeGreaterThanOrEqual(0);
    expect(popupBounds!.y + popupBounds!.height).toBeLessThanOrEqual(480);
    await expect
      .poll(() =>
        popup.evaluate((element) => element.parentElement === document.body),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);

    const glass = popup.getByRole('radio', { name: 'Liquid Glass' });
    await glass.click();
    await expect(glass).toBeChecked();
    const dark = popup.getByRole('radio', { name: 'Dark' });
    await dark.focus();
    await dark.press('Space');
    await expect(dark).toBeChecked();
    const appearance = popup.getByRole('menuitem', { name: /All settings/u });
    await appearance.focus();
    await appearance.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  });
}

for (const width of [375, 1280] as const) {
  for (const closeMethod of ['Close control', 'Escape'] as const) {
    test(`T041 ${closeMethod} restores the connected ${width}px Settings opener`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await page.goto('/');

      const actionBar = page.getByRole('navigation', {
        name: 'Application actions',
      });
      const opener =
        width === 375
          ? actionBar.getByRole('button', { name: 'More actions' })
          : actionBar.getByRole('button', { name: 'Settings', exact: true });
      await openSettings(page);
      const dialog = page.getByRole('dialog', { name: 'Settings' });
      if (closeMethod === 'Escape') {
        await page.keyboard.press('Escape');
      } else {
        await dialog.getByRole('button', { name: 'Close' }).click();
      }

      await expect(dialog).toHaveCount(0);
      await expect
        .poll(() => opener.evaluate((element) => element.isConnected))
        .toBe(true);
      await expect(opener).toBeFocused();
    });
  }
}

test('T026 shell actions, focus, reset, sidebar, notification, identity, and absence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  await openSettings(page);
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeFocused();
  await page.getByRole('radio', { name: 'Minimal' }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.getByRole('button', { name: 'Reset appearance' }).click();
  await expect(page.getByRole('radio', { name: 'Material' })).toBeChecked();
  await expect(
    page.getByRole('radio', { name: 'Follows system' }),
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();

  await openAction(page, 'View');
  const workspaceToggle = page.getByRole('menuitemcheckbox', {
    name: 'Toggle Sidebar',
  });
  await workspaceToggle.click();
  await expect(
    page.getByRole('complementary', { name: 'Workspace' }),
  ).toBeHidden();
  await openAction(page, 'View');
  await page.getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Workspace' }),
  ).toBeVisible();

  await openAction(page, 'About');
  await page
    .getByRole('menu', { name: 'About' })
    .getByRole('menuitem', { name: 'About GoMarkEdit' })
    .click();
  const about = page.getByRole('dialog', { name: 'About GoMarkEdit' });
  await expect(about).toBeFocused();
  await expect(about.getByText('Version dev', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/?rejectAppearance=1');
  await openSettings(page);
  await page.getByRole('radio', { name: 'Liquid Glass' }).click();
  const errorToast = page.locator('[data-severity="error"]');
  await expect(errorToast).toContainText('Invalid input');
  await expect(errorToast).toContainText('A value needs to be corrected.');
  await expect(page.getByText(/private|https?:\/\//i)).toHaveCount(0);
  await errorToast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(errorToast).toHaveCount(0);
  await expectEditorStageFixtures(page, 1280);
});

test('T029 keeps a long localized shell label and its two-layer keyboard focus ring visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 720 });
  await page.goto('/');

  const actionBar = page.getByRole('navigation', {
    name: 'Application actions',
  });
  const settings = actionBar.locator('button[data-settings-opener]');
  await expect(settings).toHaveAccessibleName('Settings');
  await settings.focus();
  await settings.evaluate((button) => {
    button.textContent =
      'Einstellungen und Arbeitsbereichsoptionen fuer die Dokumentbearbeitung';
  });
  await expect(settings).toBeFocused();
  await expect(settings).toHaveAccessibleName(
    'Einstellungen und Arbeitsbereichsoptionen fuer die Dokumentbearbeitung',
  );
  expect(
    await settings.evaluate(
      (button) => button.scrollWidth <= button.clientWidth,
    ),
  ).toBe(true);

  const focusStyle = await settings.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(focusStyle.outlineStyle).toBe('none');
  expect(focusStyle.outlineWidth).toBe('0px');
  expect(focusStyle.boxShadow).toMatch(/0px 0px 0px 2px/);
  expect(focusStyle.boxShadow).toMatch(/0px 0px 0px 4px/);

  const focusRingIsClipped = await settings.evaluate((button) => {
    const focusOutset = 4;
    const buttonBounds = button.getBoundingClientRect();
    let ancestor = button.parentElement;
    while (ancestor !== null) {
      const overflow = getComputedStyle(ancestor).overflow;
      if (overflow !== 'visible') {
        const bounds = ancestor.getBoundingClientRect();
        return (
          buttonBounds.left - focusOutset < bounds.left ||
          buttonBounds.right + focusOutset > bounds.right ||
          buttonBounds.top - focusOutset < bounds.top ||
          buttonBounds.bottom + focusOutset > bounds.bottom
        );
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  });

  expect(focusRingIsClipped).toBe(false);
});

test('T026 representative shell journey stays local-only', async ({
  page,
}, testInfo) => {
  const requests = observeShellRequests(page, 'http://127.0.0.1:4173');
  await page.goto('/');
  await openSettings(page);
  await page
    .getByRole('dialog', { name: 'Settings' })
    .getByRole('button', { name: 'Close' })
    .click();
  await openAction(page, 'View');
  await page.keyboard.press('Escape');
  await openAction(page, 'About');
  await page.keyboard.press('Escape');
  await page.waitForLoadState('networkidle');

  assertLocalRequests(requests);
  await testInfo.attach('window-shell-requests.json', {
    body: JSON.stringify(requests, null, 2),
    contentType: 'application/json',
  });
});

test('T026 retains at least 20 measured resize and divider samples', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await startFrameGapObserver(page);
  const resizeSamples: ShellTimingSample[] = [];

  for (let index = 0; index < 20; index += 1) {
    const frameGapSample = await beginFrameGapSample(page);
    const targetWidth = index % 2 === 0 ? 1279 : 1280;
    const patchCountBeforeInput = await statePatchCount(page);
    await page.setViewportSize({
      width: targetWidth,
      height: 720,
    });
    await expect
      .poll(() => page.evaluate(() => window.innerWidth))
      .toBe(targetWidth);
    const visibleUpdateMs =
      (await browserNextFrame(page)) - frameGapSample.startedAt;
    const inputStoppedAt = await browserNow(page);
    await waitForAcknowledgedLayoutAfter(page, patchCountBeforeInput, {
      windowHeight: 720,
      windowWidth: targetWidth,
    });
    const acknowledgedAt = await browserNow(page);
    const freezeMs = await finishFrameGapSample(page, frameGapSample);
    resizeSamples.push({
      visibleUpdateMs,
      freezeMs,
      acknowledgedMs: acknowledgedAt - inputStoppedAt,
    });
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  const workspace = page.getByRole('complementary', { name: 'Workspace' });
  const divider = page.getByRole('separator', { name: 'Resize workspace' });
  const box = await divider.boundingBox();
  const workspaceBox = await workspace.boundingBox();
  expect(box).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  const pointerY = box!.y + box!.height / 2;
  const dividerSamples: ShellTimingSample[] = [];
  for (let index = 0; index < 20; index += 1) {
    const target = 260 + index;
    const frameGapSample = await beginFrameGapSample(page);
    const currentDividerBox = await divider.boundingBox();
    const currentWorkspaceBox = await workspace.boundingBox();
    expect(currentDividerBox).not.toBeNull();
    expect(currentWorkspaceBox).not.toBeNull();
    const pointerStartX = currentDividerBox!.x + currentDividerBox!.width / 2;
    const currentWorkspaceWidth = Math.round(currentWorkspaceBox!.width);
    await page.mouse.move(pointerStartX, pointerY);
    await page.mouse.down();
    await page.mouse.move(
      pointerStartX + target - currentWorkspaceWidth,
      pointerY,
    );
    await expect
      .poll(async () =>
        Math.round((await workspace.boundingBox())?.width ?? -1),
      )
      .toBe(target);
    const visiblyUpdated = await browserNow(page);
    await expect(divider).toHaveAttribute('aria-valuenow', String(target));
    await page.mouse.up();
    const release = await markInputRelease(page);
    await waitForAcknowledgedLayoutAfter(page, release.patchCount, {
      sidebarWidth: target,
    });
    const acknowledgedAt = await browserNow(page);
    const freezeMs = await finishFrameGapSample(page, frameGapSample);
    dividerSamples.push({
      visibleUpdateMs: visiblyUpdated - frameGapSample.startedAt,
      freezeMs,
      acknowledgedMs: acknowledgedAt - release.stoppedAt,
    });
  }
  await expect(divider).toHaveAttribute('aria-valuenow', '279');
  await expect.poll(() => acknowledgedWorkspaceWidth(page)).toBe(279);

  await testInfo.attach('window-shell-timing.json', {
    body: JSON.stringify({ resizeSamples, dividerSamples }, null, 2),
    contentType: 'application/json',
  });
  assertShellTiming(resizeSamples);
  assertShellTiming(dividerSamples);
});
