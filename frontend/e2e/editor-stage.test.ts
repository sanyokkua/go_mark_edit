import { expect, test } from '@playwright/test';

import { expectPainted } from './painted';

const widths = [1280, 768, 375] as const;
const themes = ['Liquid Glass', 'Material', 'Minimal'] as const;
/*
 * The compact Settings popup's appearance rows, which the binding spells
 * `Auto (system)` (`mockup.html:615`). The full Settings dialog spells the same
 * choice `Follows system` — a different surface with different catalogue keys,
 * and these cases drive the popup.
 */
const modes = ['Auto (system)', 'Light', 'Dark'] as const;

for (const width of widths) {
  for (const theme of themes) {
    for (const mode of modes) {
      test(`T019 ${width}px ${theme} ${mode} keeps the Editor stage reachable`, async ({
        page,
      }) => {
        const unexpectedRequests: string[] = [];
        page.on('request', (request): void => {
          const url = request.url();
          if (url.startsWith('data:') || url.startsWith('blob:')) return;
          try {
            if (new URL(url).hostname !== '127.0.0.1') {
              unexpectedRequests.push(url);
            }
          } catch {
            unexpectedRequests.push(url);
          }
        });
        await page.setViewportSize({ width, height: 720 });
        await page.goto('/');
        await expect(
          page.getByRole('navigation', { name: 'Application actions' }),
        ).toBeVisible();
        await expect(
          page.getByRole('tablist', { name: 'Document tabs' }),
        ).toBeVisible();
        await expect(
          page.getByRole('toolbar', { name: 'Document toolbar' }),
        ).toBeVisible();

        if (width === 375) {
          await expect(
            page.getByRole('button', { name: 'More actions' }),
          ).toBeVisible();
          await page.getByRole('button', { name: 'More actions' }).click();
          await page.getByRole('menuitem', { name: 'Settings' }).click();
        } else {
          await page.getByRole('button', { name: 'Settings' }).click();
        }
        const settings = page.getByRole('menu', { name: 'Settings menu' });
        await expect(settings).toBeVisible();
        await settings.getByRole('radio', { name: theme }).click();
        await settings.getByRole('radio', { name: mode }).click();
        await expect(page.locator('html')).toHaveAttribute(
          'data-theme',
          themes.indexOf(theme) === 0
            ? 'glass'
            : themes.indexOf(theme) === 1
              ? 'material'
              : 'minimal',
        );
        await expect(page.locator('html')).toHaveAttribute(
          'data-mode',
          mode === 'Light'
            ? 'light'
            : mode === 'Dark'
              ? 'dark'
              : /auto|system/i.test(mode)
                ? 'light'
                : mode.toLowerCase(),
        );

        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('tab', { name: 'Untitled' }).first(),
        ).toBeVisible();
        if (width === 375) {
          await page
            .getByRole('button', { name: 'More actions' })
            .first()
            .click();
          await page.getByRole('menuitem', { name: 'View' }).click();
        } else {
          await page.getByRole('button', { name: 'View' }).click();
        }
        await expect(
          page.getByRole('menu', { name: 'View options' }),
        ).toBeVisible();
        await expect(
          page.getByRole('menuitem', { name: 'Toggle Assistant' }),
        ).toBeDisabled();
        await expect(
          page.getByRole('button', { name: 'Format' }),
        ).toBeDisabled();

        const overflow = await page.evaluate(() => ({
          body: document.body.scrollWidth,
          frame:
            document.querySelector<HTMLElement>('.application-frame')
              ?.scrollWidth ?? 0,
          viewport: window.innerWidth,
          tabs:
            document.querySelector<HTMLElement>('[role="tablist"]')
              ?.scrollWidth ?? 0,
        }));
        expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
        expect(overflow.frame).toBeLessThanOrEqual(overflow.viewport);
        /*
         * The tab strip becomes a scroll container only when its tabs actually
         * overflow (`6efb45fa`). That is deliberate: making it one
         * unconditionally costs ~332 deterministic antialiasing pixels, because
         * Chromium composites scrollable areas and drops LCD subpixel
         * antialiasing inside them.
         *
         * This used to assert the strip always overflows at 375, which only
         * held when the fixture carried several tabs. Asserting both directions
         * pins the actual rule instead: scrollable exactly when it needs to be.
         */
        const tabStrip = page.locator('[role="tablist"]');
        const tabsOverflow = await tabStrip.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        );
        await expect(tabStrip).toHaveCSS(
          'overflow-x',
          tabsOverflow ? 'auto' : 'visible',
        );
        expect(unexpectedRequests).toEqual([]);
      });
    }
  }
}

for (const width of widths) {
  for (const theme of themes) {
    for (const mode of modes) {
      // Proves: FR-FT-046 (partial — only the "no clipping" clause, and only for the About dialog; the popup containment arithmetic around it is the containment clause)
      test(`T070 ${width}px ${theme} ${mode} keeps popup ownership and geometry safe`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 720 });
        await page.goto('/');

        const openShellItem = async (name: string): Promise<void> => {
          if (width !== 375) {
            await page.getByRole('button', { name }).click();
            return;
          }
          await page
            .getByRole('button', { name: 'More actions' })
            .first()
            .click();
          await page.getByRole('menuitem', { name }).click();
        };
        await openShellItem('Settings');
        const settings = page.getByRole('menu', { name: 'Settings menu' });
        await expect(settings).toBeVisible();
        await settings.getByRole('radio', { name: theme }).click();
        await settings.getByRole('radio', { name: mode }).click();
        const settingsBox = await settings.boundingBox();
        expect(settingsBox).not.toBeNull();
        expect(settings).toHaveAttribute(
          'data-viewport-popup',
          'settings-menu',
        );
        expect(
          await settings.evaluate((element) => document.body.contains(element)),
        ).toBe(true);
        expect(settingsBox!.x).toBeGreaterThanOrEqual(0);
        expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(width);
        expect(settingsBox!.y).toBeGreaterThanOrEqual(0);
        expect(settingsBox!.y + settingsBox!.height).toBeLessThanOrEqual(720);
        await page.keyboard.press('Escape');
        await expect(settings).toBeHidden();

        if (width === 375) {
          await openShellItem('File');
          const file = page.getByRole('menu', { name: 'File', exact: true });
          await expect(file).toBeVisible();
          const fileBox = await file.boundingBox();
          expect(fileBox).not.toBeNull();
          expect(file).toHaveAttribute('data-viewport-popup', 'file-menu');
          expect(
            await file.evaluate((element) => document.body.contains(element)),
          ).toBe(true);
          expect(fileBox!.x).toBeGreaterThanOrEqual(0);
          expect(fileBox!.x + fileBox!.width).toBeLessThanOrEqual(width);
          await page.keyboard.press('Escape');
          await expect(file).toBeHidden();
          await expect(
            page.getByRole('button', { name: 'More actions' }).first(),
          ).toBeFocused();

          await openShellItem('View');
          const view = page.getByRole('menu', { name: 'View options' });
          await expect(view).toBeVisible();
          const viewBox = await view.boundingBox();
          expect(viewBox).not.toBeNull();
          expect(view).toHaveAttribute('data-viewport-popup', 'view-menu');
          expect(
            await view.evaluate((element) => document.body.contains(element)),
          ).toBe(true);
          expect(viewBox!.x).toBeGreaterThanOrEqual(0);
          expect(viewBox!.x + viewBox!.width).toBeLessThanOrEqual(width);
          const shell = page.getByTestId('application-shell');
          const workspaceVisible = await shell.getAttribute(
            'data-workspace-visible',
          );
          await view
            .getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' })
            .click();
          await expect(shell).not.toHaveAttribute(
            'data-workspace-visible',
            workspaceVisible ?? '',
          );
          /*
           * The minimum window renders no workspace panel at either setting —
           * there is no room for a column and an overlay would cover the tab
           * strip. What the toggle still does at this width is move the stored
           * preference, which is what governs the wide layout, so the attribute
           * is asserted to flip both ways while the panel stays absent.
           */
          const workspacePanel = page.getByRole('complementary', {
            name: 'Workspace',
          });
          await expect(workspacePanel).toHaveCount(0);
          await openShellItem('View');
          await view
            .getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' })
            .click();
          await expect(shell).toHaveAttribute(
            'data-workspace-visible',
            workspaceVisible ?? '',
          );
          await expect(workspacePanel).toHaveCount(0);
        }

        if (width !== 375) {
          await page.getByRole('button', { name: 'File' }).click();
          const file = page.getByRole('menu', { name: 'File' });
          await expect(file).toBeVisible();
          const viewTrigger = page.getByRole('button', { name: 'View' });
          await viewTrigger.click();
          await expect(file).toBeHidden();
          await expect(viewTrigger).toHaveAttribute('aria-expanded', 'true');
          const view = page.getByRole('menu', { name: 'View options' });
          await expect(view).toBeVisible();
          const viewBox = await view.boundingBox();
          expect(viewBox).not.toBeNull();
          expect(view).toHaveAttribute('data-viewport-popup', 'view-menu');
          expect(
            await view.evaluate((element) => document.body.contains(element)),
          ).toBe(true);
          expect(viewBox!.x).toBeGreaterThanOrEqual(0);
          expect(viewBox!.x + viewBox!.width).toBeLessThanOrEqual(width);
          await page.keyboard.press('Escape');
          await expect(view).toBeHidden();
          await expect(viewTrigger).toBeFocused();

          const shell = page.getByTestId('application-shell');
          const sidebar = page
            .getByRole('navigation', { name: 'Application actions' })
            .getByRole('button', { name: 'Toggle Sidebar' });
          const workspaceVisible = await shell.getAttribute(
            'data-workspace-visible',
          );
          await sidebar.click();
          await expect(shell).not.toHaveAttribute(
            'data-workspace-visible',
            workspaceVisible ?? '',
          );
          await sidebar.click();
          await expect(shell).toHaveAttribute(
            'data-workspace-visible',
            workspaceVisible ?? '',
          );
        }

        await openShellItem('About');
        const aboutMenu = page.getByRole('menu', { name: 'About' });
        await expect(aboutMenu).toBeVisible();
        expect(aboutMenu).toHaveAttribute('data-viewport-popup', 'about-menu');
        expect(
          await aboutMenu.evaluate((element) =>
            document.body.contains(element),
          ),
        ).toBe(true);
        await aboutMenu
          .getByRole('menuitem', { name: 'About GoMarkEdit' })
          .click();
        const aboutDialog = page.getByRole('dialog', {
          name: 'About GoMarkEdit',
        });
        await expect(aboutDialog).toBeVisible();
        /*
         * T126. `toBeVisible()` is satisfied by a bounding box alone, so it
         * passes on a dialog an ancestor has clipped to nothing (T113). Proven
         * load-bearing: clip `.application-frame` and `toBeVisible()` above
         * stays green while this reports "laid out at (640, 360) but the
         * topmost paint there is div#root".
         */
        await expectPainted(aboutDialog, `the About dialog at ${width}px`);
        await page.keyboard.press('Escape');
        await expect(aboutDialog).toBeHidden();
        expect(
          await page.evaluate(
            () =>
              document.elementFromPoint(window.innerWidth / 2, 400) !== null,
          ),
        ).toBe(true);
      });
    }
  }
}

for (const width of widths) {
  for (const theme of themes) {
    for (const mode of modes) {
      test(`T069 ${width}px ${theme} ${mode} retains the mockup chrome hierarchy`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 720 });
        await page.goto('/');

        const settingsTrigger =
          width === 375
            ? page.getByRole('button', { name: 'More actions' }).first()
            : page.getByRole('button', { name: 'Settings' });
        await settingsTrigger.click();
        if (width === 375) {
          await page.getByRole('menuitem', { name: 'Settings' }).click();
        }
        const settings = page.getByRole('menu', { name: 'Settings menu' });
        await settings.getByRole('radio', { name: theme }).click();
        await settings.getByRole('radio', { name: mode }).click();
        await page.keyboard.press('Escape');

        const navigation = page.getByRole('navigation', {
          name: 'Application actions',
        });
        const tabs = page.getByRole('tablist', { name: 'Document tabs' });
        const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
        const editor = page.getByRole('region', { name: 'Editor pane' });
        const preview = page.getByRole('region', { name: 'Preview pane' });
        const status = page.getByLabel('Document status', { exact: true });

        /*
         * The minimum window carries one pane: Split collapses to the editor
         * and the preview is removed from the tree, so there is no viewer to
         * measure at 375. Above that width both panes are laid out and the
         * hierarchy is asserted against each of them.
         */
        const minimumWindow = width === 375;
        if (minimumWindow) {
          await expect(preview).toHaveCount(0);
        }
        const [navigationBox, tabsBox, toolbarBox, editorBox, statusBox] =
          await Promise.all([
            navigation.boundingBox(),
            tabs.boundingBox(),
            toolbar.boundingBox(),
            editor.boundingBox(),
            status.boundingBox(),
          ]);
        const previewBox = minimumWindow ? null : await preview.boundingBox();
        expect(navigationBox).not.toBeNull();
        expect(tabsBox).not.toBeNull();
        expect(toolbarBox).not.toBeNull();
        expect(editorBox).not.toBeNull();
        expect(statusBox).not.toBeNull();
        expect(navigationBox!.y).toBeLessThan(tabsBox!.y);
        expect(tabsBox!.y).toBeLessThan(toolbarBox!.y);
        expect(toolbarBox!.y).toBeLessThan(editorBox!.y);
        expect(statusBox!.y).toBeGreaterThan(editorBox!.y);
        expect(editorBox!.width).toBeGreaterThan(0);
        if (minimumWindow) {
          /*
           * The surviving pane fills the region rather than sharing it: only
           * the pane row's own inline padding is taken off the viewport, where
           * a stacked or side-by-side split would leave it near half.
           */
          expect(editorBox!.width).toBeGreaterThan(width * 0.8);
        } else {
          expect(previewBox).not.toBeNull();
          expect(toolbarBox!.y).toBeLessThan(previewBox!.y);
          expect(statusBox!.y).toBeGreaterThan(previewBox!.y);
          expect(previewBox!.width).toBeGreaterThan(0);
        }
        /*
         * These two assertions used to require the tabs be `toBeDisabled()`,
         * and to name `spec-draft.md`. Both were written when the shell was a
         * static picture and the tab strip was decoration. Feature 003's whole
         * purpose was making these tabs real, so a disabled tab is now the
         * failure, not the expectation. The chrome hierarchy above is still the
         * subject of this case; what follows checks the strip is a working
         * control at this width and palette rather than a drawing of one.
         */
        const documentTabs = page.getByRole('tab');
        await expect(documentTabs.first()).toBeEnabled();
        await expect(documentTabs.first()).toHaveAttribute(
          'aria-selected',
          'true',
        );
        /*
         * The new-tab control is exercised at every width, 375 included. It
         * used to be skipped there: the workspace opened as an overlay sitting
         * on top of the tab strip, and Playwright reported the
         * `<aside aria-label="Workspace">` intercepting the pointer. The
         * minimum window renders no workspace at all, so nothing covers the
         * strip and the control is reachable on first sight.
         */
        const newTab = page.getByRole('button', { name: 'New tab' });
        if (await newTab.isVisible()) {
          const initialTabs = await documentTabs.count();
          await newTab.click();
          await expect(documentTabs).toHaveCount(initialTabs + 1);
          await expect(documentTabs.nth(initialTabs)).toHaveAttribute(
            'aria-selected',
            'true',
          );
          await documentTabs
            .nth(initialTabs)
            .locator('..')
            .getByRole('button', { name: /^Close /u })
            .click();
          await expect(documentTabs).toHaveCount(initialTabs);
          await expect(documentTabs.first()).toHaveAttribute(
            'aria-selected',
            'true',
          );
        }
        await expect(page.locator('html')).toHaveAttribute(
          'data-theme',
          themes.indexOf(theme) === 0
            ? 'glass'
            : themes.indexOf(theme) === 1
              ? 'material'
              : 'minimal',
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      });
    }
  }
}

for (const width of widths) {
  for (const theme of themes) {
    for (const mode of modes) {
      // Proves: FR-FT-046 (partial — only the "no clipping" clause, for the editor context menu at all three widths and the toolbar overflow menu at 375 and 768)
      test(`T055 ${width}px ${theme} ${mode} exercises reachable Editor-stage journeys`, async ({
        page,
      }) => {
        const unexpectedRequests: string[] = [];
        page.on('request', (request): void => {
          const url = request.url();
          if (url.startsWith('data:') || url.startsWith('blob:')) return;
          try {
            if (new URL(url).hostname !== '127.0.0.1') {
              unexpectedRequests.push(url);
            }
          } catch {
            unexpectedRequests.push(url);
          }
        });

        await page.setViewportSize({ width, height: 720 });
        await page.goto('/');
        const editor = page.getByRole('textbox', { name: 'Editor content' });
        await expect(editor).toBeVisible();
        const modifier = await page.evaluate(() =>
          /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control',
        );
        const replaceEditorText = async (): Promise<void> => {
          await editor.press(`${modifier}+a`);
          await page.keyboard.type('hello');
        };

        const settingsTrigger =
          width === 375
            ? page.getByRole('button', { name: 'More actions' }).first()
            : page.getByRole('button', { name: 'Settings' });
        if (width === 375) {
          await settingsTrigger.click();
          await page.getByRole('menuitem', { name: 'Settings' }).click();
        } else {
          await settingsTrigger.click();
        }
        const settings = page.getByRole('menu', { name: 'Settings menu' });
        await settings.getByRole('radio', { name: theme }).click();
        await settings.getByRole('radio', { name: mode }).click();
        await expect(page.locator('html')).toHaveAttribute(
          'data-theme',
          themes.indexOf(theme) === 0
            ? 'glass'
            : themes.indexOf(theme) === 1
              ? 'material'
              : 'minimal',
        );
        await page.keyboard.press('Escape');
        if (width === 375) {
          await page
            .getByRole('button', { name: 'More actions' })
            .first()
            .click();
          await page.getByRole('menuitem', { name: 'View' }).click();
          await page
            .getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' })
            .click();
          await expect(page.getByTestId('application-shell')).toHaveAttribute(
            'data-workspace-visible',
            'false',
          );
        }

        if (width === 375) {
          await page
            .getByRole('toolbar', { name: 'Document toolbar' })
            .getByLabel('More actions')
            .click();
          const overflowMenu = page.locator(
            '[data-viewport-popup="editor-overflow"]',
          );
          await expect(overflowMenu).toBeVisible();
          expect(
            await overflowMenu.evaluate((element) =>
              document.body.contains(element),
            ),
          ).toBe(true);
          /*
           * T126. `document.body.contains` proves the portal target, not that
           * the menu reached the screen; `toBeVisible()` proves a box, not a
           * paint. Proven load-bearing: clip `body` and both stay green while
           * this reports "laid out at (412.484, 185) but the topmost paint
           * there is html".
           */
          await expectPainted(overflowMenu, 'the toolbar overflow menu');
        }
        await replaceEditorText();
        await editor.press(`${modifier}+a`);
        const formattingScope =
          width === 375
            ? page.locator('[data-viewport-popup="editor-overflow"]')
            : page.getByRole('toolbar', { name: 'Document toolbar' });
        await formattingScope
          .getByRole('button', { name: 'Bold' })
          .first()
          .click();
        await expect(editor).toHaveValue('**hello**');
        if (width === 375) {
          await page
            .getByRole('toolbar', { name: 'Document toolbar' })
            .getByLabel('More actions')
            .click();
        }

        if (width !== 375) {
          await replaceEditorText();
          await editor.press(`${modifier}+a`);
          await editor.press(`${modifier}+b`);
          await expect(editor).toHaveValue('**hello**');
        }

        await replaceEditorText();
        await editor.press(`${modifier}+a`);
        const editorSurface = page.locator('[data-editor-surface]');
        await editorSurface.click({
          button: 'right',
          position: { x: 20, y: 20 },
        });
        const contextMenu = page.getByRole('menu', {
          name: 'Editor context menu',
        });
        await expect(contextMenu).toBeVisible();
        expect(contextMenu).toHaveAttribute(
          'data-viewport-popup',
          'context-menu',
        );
        expect(
          await contextMenu.evaluate((element) =>
            document.body.contains(element),
          ),
        ).toBe(true);
        /*
         * T126. The bounds arithmetic below places the menu inside the
         * viewport; none of it, nor `toBeVisible()`, can tell whether the menu
         * paints there. Proven load-bearing: clip `body` and every assertion
         * around this one stays green while this reports "laid out at
         * (359, 383.5) but the topmost paint there is html".
         */
        await expectPainted(
          contextMenu,
          `the editor context menu at ${width}px`,
        );
        const contextBox = await contextMenu.boundingBox();
        expect(contextBox).not.toBeNull();
        expect(contextBox!.x).toBeGreaterThanOrEqual(0);
        expect(contextBox!.y).toBeGreaterThanOrEqual(0);
        expect(contextBox!.x + contextBox!.width).toBeLessThanOrEqual(width);
        expect(contextBox!.y + contextBox!.height).toBeLessThanOrEqual(720);
        await page.getByRole('menuitem', { name: 'Bold' }).click({
          force: width === 375,
        });
        await expect(editor).toHaveValue('**hello**');

        if (width === 375) {
          await page
            .getByRole('button', { name: 'More actions' })
            .first()
            .click();
          await page.getByRole('menuitem', { name: 'View' }).click();
          await page
            .getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' })
            .click();
        } else {
          await page
            .getByRole('navigation', { name: 'Application actions' })
            .getByRole('button', { name: 'Toggle Sidebar' })
            .click();
        }
        await expect(page.getByTestId('application-shell')).toHaveAttribute(
          'data-workspace-visible',
          width === 375 ? 'true' : 'false',
        );
        if (width === 375) {
          await page
            .getByRole('button', { name: 'More actions' })
            .first()
            .click();
          await page.getByRole('menuitem', { name: 'View' }).click();
          await page
            .getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' })
            .click();
        } else {
          await page
            .getByRole('navigation', { name: 'Application actions' })
            .getByRole('button', { name: 'Toggle Sidebar' })
            .click();
        }
        await expect(page.getByTestId('application-shell')).toHaveAttribute(
          'data-workspace-visible',
          width === 375 ? 'false' : 'true',
        );

        if (width === 768) {
          const toolbar = page.getByRole('toolbar', {
            name: 'Document toolbar',
          });
          await toolbar.getByLabel('More actions').click();
          const overflowMenu = page.locator(
            '[data-viewport-popup="editor-overflow"]',
          );
          await expect(
            overflowMenu.getByRole('button', { name: 'Link' }).last(),
          ).toBeVisible();
          await expect(overflowMenu).toBeVisible();
          expect(
            await overflowMenu.evaluate((element) =>
              document.body.contains(element),
            ),
          ).toBe(true);
          // T126: same exposure as the 375px overflow menu above.
          await expectPainted(overflowMenu, 'the 768px toolbar overflow menu');
        }

        const overflow = await page.evaluate(() => ({
          body: document.body.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
        expect(unexpectedRequests).toEqual([]);
      });
    }
  }
}
