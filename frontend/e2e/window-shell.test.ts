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
    /*
     * Accessible names, not glyph text. The sidebar and assistant controls were
     * `☰` and `✦` text spans until `ca124e41` replaced them with `<Icon>` SVGs
     * to meet FR-FT-052's binding monochrome size/stroke treatment, so
     * `allTextContents()` reads two empty strings. (The `☰` never matched the
     * binding either: `mockup.html:595` draws `▤` for toggle-sidebar.)
     */
    for (const name of [
      'File',
      'Settings',
      'View',
      'About',
      'Toggle Sidebar',
      'Toggle Assistant',
    ]) {
      await expect(
        actionBar.getByRole('button', { name, exact: true }),
      ).toBeVisible();
    }
    await expect(actionBar.getByRole('button')).toHaveCount(6);
    await expect(
      actionBar.getByRole('button', { name: 'Toggle Assistant' }),
    ).toBeDisabled();
  }

  /*
   * This helper used to assert the whole chrome was inert — disabled tabs, a
   * disabled New tab, a disabled New File. That was correct while the shell was
   * a static mock, and Feature 003's entire purpose was making it real, so a
   * blanket `toBeDisabled()` now asserts the opposite of the requirement. What
   * it checks instead is the inventory plus availability as the action registry
   * defines it: enabled where this feature made it real, unavailable only where
   * something is genuinely deferred.
   */
  const tabs = page.getByRole('tablist', { name: 'Document tabs' });
  await expect(tabs).toBeVisible();
  /* The plain `/` route seeds one Untitled document; `release-notes.md` and
     `spec-draft.md` are parity fixtures it never produces. */
  await expect(tabs.getByRole('tab')).toHaveCount(1);
  await expect(tabs.getByRole('tab', { name: /Untitled/u })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'New tab' })).toBeEnabled();

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
  /*
   * At 375 the overflow popup is portalled into `.application-frame` so it can
   * share the frame's containing block, which puts it outside the toolbar
   * element — scoping the lookup to `toolbar` found nothing there. Image is
   * still rendered and still unavailable; only where it lives changed.
   */
  const overflowPopup = page.locator('[data-viewport-popup="editor-overflow"]');
  const usesOverflow = width <= 768;
  const narrowOverflow = width <= 376;
  const imageControl = usesOverflow
    ? overflowPopup.getByRole('button', { name: 'Image' })
    : toolbar.getByRole('button', { name: 'Image' });
  await expect(imageControl).toBeDisabled();
  if (narrowOverflow) {
    await expect(
      overflowPopup.getByRole('radiogroup', { name: 'View arrangement' }),
    ).toBeVisible();
  }
  await page.keyboard.press('Escape');

  await openAction(page, 'File');
  /* `exact` matters: the narrow popup nests a `Recent files` submenu, and
     Playwright's accessible-name match is substring and case-insensitive, so a
     loose `File` resolves to both menus and trips strict mode. */
  const fileMenu = page.getByRole('menu', { name: 'File', exact: true });
  /* `actionRegistry.ts:198` marks new-file `available()` — Feature 003 made it
     real, so asserting it disabled asserted the opposite of the requirement. */
  await expect(
    fileMenu.getByRole('menuitem', { name: 'New File' }),
  ).toBeEnabled();
  /*
   * Recents are presented differently by width, and both are correct. Wide, the
   * binding puts them as indented rows under an `Open Recent` group label
   * (`mockup.html:604`, `.mi.sub`) with no trigger row of its own, so there
   * `Open Recent` is a label and never a `menuitem` — the same shape as
   * `Appearance`, which is a radiogroup name rather than an item. Narrow, the
   * popup uses an `Open Recent` trigger plus a nested submenu
   * (`ShellMenuRow.tsx:786-802`). This route seeds no recent files
   * (`AppModelHandler.ts:311`), so either way the rows are disabled
   * placeholders carrying the binding's two names.
   */
  if (width <= 376) {
    await expect(
      fileMenu.getByRole('menuitem', { name: 'Open Recent' }),
    ).toBeDisabled();
  } else {
    await expect(fileMenu).toContainText('Open Recent');
  }
  const recentRows = page.getByRole('menuitem', { name: 'release-notes.md' });
  await expect(recentRows).toBeDisabled();
  await expect(
    page.getByRole('menuitem', { name: 'spec-draft.md' }),
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
      if (width === 375) {
        /*
         * The minimum window renders no workspace at all: there is no room for
         * a column, and the 230px overlay this used to measure covered the tab
         * strip and intercepted pointers meant for it.
         */
        await expect(workspace).toHaveCount(0);
      } else {
        await expect(workspace).toBeVisible();
        await expect
          .poll(async () => (await workspace.boundingBox())?.width)
          /*
           * 216 is the binding's own sidebar width (`mockup.html:254`
           * `.sidebar{width:216px}`), exported as `WORKSPACE_BINDING_WIDTH` in
           * `src/logic/store/uiLayoutCommands.ts:12`. The 256 this asserted
           * before matched neither the binding nor the shipped default.
           */
          .toBe(width === 768 ? 46 : 216);
      }
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
        /*
         * The minimum window carries one pane. This used to measure the editor
         * and the preview stacked one above the other; Split now collapses to
         * the editor and the preview is removed from the tree, so the editor is
         * the whole pane row and the viewer is not there to measure.
         */
        const editor = await page.getByLabel('Editor pane').boundingBox();
        await expect(page.getByLabel('Preview pane')).toHaveCount(0);
        const document = page.getByRole('main', { name: 'Document area' });
        const documentBounds = await document.boundingBox();
        const toolbarBounds = await toolbar.boundingBox();
        await toolbar.getByLabel('More actions').click();
        /*
         * The overflow popup portals into `.application-frame` so it can share
         * the frame's containing block, which puts the relocated arrangement
         * radios outside the toolbar element. The inline switch is hidden at
         * this width (`mockup.html:76` `#viewseg`), so the popup is the only
         * place they exist.
         */
        const arrangementBounds = await page
          .locator('[data-viewport-popup="editor-overflow"]')
          .getByRole('radiogroup', { name: 'View arrangement' })
          .boundingBox();
        await page.keyboard.press('Escape');
        expect(editor).not.toBeNull();
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
        /*
         * The surviving pane fills the region: it starts inside the document
         * area and runs to its trailing edge, with nothing beside it.
         */
        expect(editor!.x).toBeGreaterThanOrEqual(documentBounds!.x);
        expect(editor!.x + editor!.width).toBeLessThanOrEqual(
          documentBounds!.x + documentBounds!.width,
        );
        expect(editor!.width).toBeGreaterThan(documentBounds!.width / 2);
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
      /*
       * `expectMonacoThemeReady` stays — it asserts the editor actually
       * resolved this palette. The whole-window screenshot that followed it is
       * withdrawn with the 2026-08-14 clarification, along with the cursor and
       * overview-ruler hiding that existed only to steady it. What this matrix
       * proves is the chrome inventory, availability, geometry and reachability
       * asserted above, at all three widths and all six palettes.
       */
      await expectMonacoThemeReady(page, mode, editorBackground);
      expect(runtimeErrors).toEqual([]);
    });
  }
}

test('T039 native minimum frame rounding drops the workspace entirely', async ({
  page,
}) => {
  /*
   * The native minimum window is 375x480 (`main.go:104-105`); frame rounding
   * can expose this 376px CSS viewport at that size, so it is the minimum
   * window too. The workspace used to be presented here as a 230px overlay —
   * off-canvas in name only, since it painted over the tab strip and
   * intercepted its pointers. It is no longer rendered at this width.
   */
  await page.setViewportSize({ width: 376, height: 480 });
  await page.goto('/');

  await expect(
    page.getByRole('complementary', { name: 'Workspace' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('separator', { name: 'Resize workspace' }),
  ).toHaveCount(0);
  /*
   * The stored preference is untouched, so the shell still reports it — the
   * collapse owns no second "is it open" state.
   */
  await expect(page.getByTestId('application-shell')).toHaveAttribute(
    'data-workspace-visible',
    'true',
  );
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
    /*
     * The popup must escape its trigger's subtree so no ancestor can clip it.
     * It is portalled into `.application-frame` rather than `document.body`
     * (`SettingsMenu.tsx:513`) so it shares the frame's containing block
     * instead of being placed by collision-aware viewport coordinates —
     * asserting `document.body` described the portal target before that
     * convergence. The invariant the case actually needs is unchanged: the
     * popup is a direct child of the top-level frame, and is not nested inside
     * the menu root that owns the trigger.
     */
    await expect
      .poll(() =>
        popup.evaluate(
          (element) =>
            element.parentElement ===
            (document.querySelector('.application-frame') ?? document.body),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        popup.evaluate(
          (element) => element.closest('[data-settings-menu-root]') === null,
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
