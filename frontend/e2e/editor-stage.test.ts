import { expect, test } from '@playwright/test';

const widths = [1280, 768, 375] as const;
const themes = ['Liquid Glass', 'Material', 'Minimal'] as const;
const modes = ['Follows system', 'Light', 'Dark'] as const;

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
          page.getByRole('tab', { name: 'release-notes.md' }),
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
        if (width === 375) {
          expect(overflow.tabs).toBeGreaterThan(overflow.viewport);
          await expect(page.locator('[role="tablist"]')).toHaveCSS(
            'overflow-x',
            'auto',
          );
        }
        expect(unexpectedRequests).toEqual([]);
      });
    }
  }
}

for (const width of widths) {
  for (const theme of themes) {
    for (const mode of modes) {
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
          await expect(
            page.getByRole('complementary', { name: 'Workspace' }),
          ).toBeHidden();
          await openShellItem('View');
          await view
            .getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' })
            .click();
          await expect(shell).toHaveAttribute(
            'data-workspace-visible',
            workspaceVisible ?? '',
          );
          await expect(
            page.getByRole('complementary', { name: 'Workspace' }),
          ).toBeVisible();
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
        await aboutMenu
          .getByRole('menuitem', { name: 'About GoMarkEdit' })
          .click();
        const aboutDialog = page.getByRole('dialog', {
          name: 'About GoMarkEdit',
        });
        await expect(aboutDialog).toBeVisible();
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

        const [
          navigationBox,
          tabsBox,
          toolbarBox,
          editorBox,
          previewBox,
          statusBox,
        ] = await Promise.all([
          navigation.boundingBox(),
          tabs.boundingBox(),
          toolbar.boundingBox(),
          editor.boundingBox(),
          preview.boundingBox(),
          status.boundingBox(),
        ]);
        expect(navigationBox).not.toBeNull();
        expect(tabsBox).not.toBeNull();
        expect(toolbarBox).not.toBeNull();
        expect(editorBox).not.toBeNull();
        expect(previewBox).not.toBeNull();
        expect(statusBox).not.toBeNull();
        expect(navigationBox!.y).toBeLessThan(tabsBox!.y);
        expect(tabsBox!.y).toBeLessThan(toolbarBox!.y);
        expect(toolbarBox!.y).toBeLessThan(editorBox!.y);
        expect(toolbarBox!.y).toBeLessThan(previewBox!.y);
        expect(statusBox!.y).toBeGreaterThan(editorBox!.y);
        expect(statusBox!.y).toBeGreaterThan(previewBox!.y);
        expect(editorBox!.width).toBeGreaterThan(0);
        expect(previewBox!.width).toBeGreaterThan(0);
        await expect(
          page.getByRole('tab', { name: 'release-notes.md' }),
        ).toBeDisabled();
        await expect(
          page.getByRole('tab', { name: 'spec-draft.md' }),
        ).toBeDisabled();
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
        }
        await replaceEditorText();
        await editor.press(`${modifier}+a`);
        await page
          .getByRole('toolbar', { name: 'Document toolbar' })
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
          await expect(
            toolbar.getByRole('button', { name: 'Link' }).last(),
          ).toBeVisible();
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
