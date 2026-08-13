import { expect, test } from '@playwright/test';

test('FT-VS-01 operates New/Open from the real File menu and keeps the shell usable', async ({
  page,
}) => {
  await page.goto('/');

  const file = page.getByRole('button', { name: 'File' });
  await expect(file).toBeVisible();
  await file.click();

  const menu = page.getByRole('menu', { name: 'File' });
  await expect(menu.getByRole('menuitem', { name: 'New File' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Open File' })).toBeEnabled();

  await menu.getByRole('menuitem', { name: 'New File' }).click();
  await expect(page.locator('[data-document-state="active"]')).toBeVisible();

  await file.click();
  await menu.getByRole('menuitem', { name: 'Open File' }).click();
  await expect(page.locator('[data-document-state="active"]')).toBeVisible();
  await expect(page.getByRole('main', { name: 'Document area' })).toBeVisible();
});

test('FT-VS-02 flushes the latest edit and reports one explicit Save confirmation', async ({
  page,
}) => {
  await page.goto('/');

  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await expect(editor).toBeVisible();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('saved from the real editor');

  const file = page.getByRole('button', { name: 'File' });
  await file.click();
  const menu = page.getByRole('menu', { name: 'File' });
  const save = menu.getByRole('menuitem').filter({ hasText: /^Save$/u });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(
    page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);
  // The committed status shows in the title bar, where the binding draws it.
  await expect(
    page
      .locator('header[aria-label="Document identity"]')
      .filter({ hasText: 'Saved' }),
  ).toHaveCount(1);
});

test('FT-VS-03 exposes real tabs, backend-confirmed menu moves, and exact navigation', async ({
  page,
}) => {
  await page.goto('/');

  const newTab = page.getByRole('button', { name: 'New tab' });
  await expect(newTab).toBeEnabled();
  await newTab.click();
  await expect(page.getByRole('tab')).toHaveCount(2);

  const tabs = page.getByRole('tab');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(1).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Tab actions' });
  await expect(
    menu.getByRole('menuitem', { name: 'Move tab left' }),
  ).toBeEnabled();
  await expect(
    menu.getByRole('menuitem', { name: 'Move tab right' }),
  ).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'Move tab left' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved' }),
  ).toContainText('position 1 of 2');

  await page.keyboard.press('Control+PageDown');
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('FT-VS-04 shows the bounded external-change prompt and safe Skip decision', async ({
  page,
}) => {
  await page.goto('/?ft-vs-04');

  await page.getByRole('button', { name: 'New tab' }).click();
  const tabs = page.getByRole('tab');
  await tabs.nth(1).click();

  const prompt = page.getByRole('dialog', { name: 'File changed on disk' });
  await expect(prompt).toBeVisible();
  await expect(
    prompt.getByRole('heading', { name: /^On disk ·/u }),
  ).toBeVisible();
  await expect(
    prompt.getByRole('heading', { name: /^Yours ·/u }),
  ).toBeVisible();
  await expect(prompt.getByRole('button').allTextContents()).resolves.toEqual([
    'Reload from disk',
    'Keep mine',
    'Skip',
  ]);
  await expect(prompt.getByRole('button', { name: 'Skip' })).toBeFocused();
  await prompt.getByRole('button', { name: 'Skip' }).click();
  await expect(prompt).toHaveCount(0);
});

test('FT-VS-05 exposes acknowledged autosave control and truthful save status wiring', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();
  const menu = page.getByRole('menu', { name: 'Settings menu' });
  const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
  // Drive the visible switch, which is what the pointer actually lands on: the
  // checkbox itself is 1px and transparent. Clicking the input directly would
  // exercise a control no user can reach.
  const autosaveSwitch = menu.locator('[data-settings-toggle="Autosave"]');
  await expect(autosave).toBeChecked();
  await expect(autosaveSwitch).toHaveAttribute('data-checked', 'true');

  await autosaveSwitch.click();
  await expect(autosave).not.toBeChecked();
  await expect(autosaveSwitch).toHaveAttribute('data-checked', 'false');

  await autosaveSwitch.click();
  await expect(autosave).toBeChecked();
  await expect(autosaveSwitch).toHaveAttribute('data-checked', 'true');
  await expect(
    menu.getByRole('menuitem', { name: 'Format on save' }),
  ).toBeDisabled();
  await expect(
    menu.getByRole('menuitem', { name: 'Lint on save' }),
  ).toBeDisabled();

  // The save status lives in the title bar, where the binding draws it; the
  // status row carries no copy of it.
  await expect(
    page.locator('header[aria-label="Document identity"]'),
  ).toContainText('Not saved');
  await expect(page.locator('footer')).not.toContainText('Not saved');
  await expect(page.locator('[data-write-in-flight="true"]')).toHaveCount(0);
  await expect(
    page.locator('[data-notification-code="automatic-save"]'),
  ).toHaveCount(0);
});

test('FT-VS-06 close plan gathers a complete choice before any tab removal', async ({
  page,
}) => {
  await page.goto('/?close-plan');

  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await expect(editor).toBeVisible();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('dirty before close');

  const firstTab = page.getByRole('tab').first();
  const tabItem = firstTab.locator('..');
  await tabItem.getByRole('button', { name: /^Close /u }).click();

  const prompt = page.getByRole('dialog', {
    name: 'Save changes before closing?',
  });
  await expect(prompt).toBeVisible();
  await expect(
    prompt.locator('[data-close-target="mock-document"]'),
  ).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(1);

  await prompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(1);

  await tabItem.getByRole('button', { name: /^Close /u }).click();
  const secondPrompt = page.getByRole('dialog', {
    name: 'Save changes before closing?',
  });
  await secondPrompt.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('FT-VS-07 proves recents, reopen, launcher, and responsive status controls', async ({
  page,
}) => {
  await page.goto('/?ft-vs-07');

  const file = page.getByRole('button', { name: 'File' });
  await file.click();
  const menu = page.getByRole('menu', { name: 'File' });
  /*
   * The binding File popup presents recents as indented rows inside the popup
   * itself (`mockup.html:604`, `.mi.sub`), not behind an Open Recent submenu.
   * Asserting the whole ordered row list proves both the six entries and the
   * grouping the binding places them in.
   */
  await expect(menu.getByRole('menuitem')).toHaveText([
    'New File',
    'New Window',
    'Open File…',
    'Open Folder…',
    't032-recent-07.md',
    't032-recent-06.md',
    't032-recent-05.md',
    't032-recent-04.md',
    't032-recent-03.md',
    't032-recent-02.md',
    '↺ Reopen last file',
    'Save',
    'Save As…',
    'Export to PDF…',
    'Close Tab',
    'Exit',
  ]);
  const recentItems = menu.getByRole('menuitem', { name: /^t032-recent-/u });
  await expect(recentItems).toHaveCount(6);
  await recentItems.nth(3).click();
  await expect(
    page.locator('[aria-label="Document identity"] h1'),
  ).toContainText('t032-recent-04.md');

  const openedTab = page.getByRole('tab', { name: 't032-recent-04.md' });
  await expect(openedTab).toHaveAttribute('aria-selected', 'true');
  await openedTab
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
  const closePrompt = page.getByRole('dialog', {
    name: 'Save changes before closing?',
  });
  await closePrompt.getByRole('button', { name: 'Discard' }).click();
  await expect(
    page.locator('[data-notification-code="not_found"]'),
  ).toHaveCount(0);

  await file.click();
  const reopen = page
    .getByRole('menu', { name: 'File' })
    .getByRole('menuitem', {
      name: 'Reopen last file',
    });
  await expect(reopen).toBeEnabled();
  await reopen.click();
  await expect(
    page.locator('[aria-label="Document identity"] h1'),
  ).toContainText('t032-recent-04.md');
  await expect(
    page.locator('[data-notification-code="not_found"]'),
  ).toHaveCount(0);

  await page.goto('/?ft-vs-07');
  const initialTab = page.getByRole('tab', { name: 'Untitled' });
  await initialTab
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await expect(
    launcher.getByRole('button', { name: 'Open Folder' }),
  ).toBeDisabled();
  await expect(launcher.getByRole('listitem')).toHaveCount(6);
  await expect(launcher.getByRole('listitem').first()).toContainText(
    't032-recent-07.md',
  );

  await launcher.getByRole('button', { name: 't032-recent-07.md' }).click();
  await expect(
    page.getByRole('tab', { name: 't032-recent-07.md' }),
  ).toBeVisible();
  await expect(
    page.locator('[data-notification-code="not_found"]'),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 720 });
  const details = page.getByRole('button', { name: 'Document details' });
  await expect(details).toBeVisible();
  await details.click();
  await expect(
    page.getByRole('region', { name: 'Document details' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.innerWidth)).toBe(375);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test('T051 keeps parity launchers isolated from the FT-VS-07 recent seed', async ({
  page,
}) => {
  await page.goto('/?ft-vs-07&parity-case=primary:empty:1280:glass-light');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const tab = page.getByRole('tab').first();
    await tab
      .locator('..')
      .getByRole('button', { name: /^Close /u })
      .click();
    const prompt = page.getByRole('dialog', {
      name: 'Save changes before closing?',
    });
    if (await prompt.isVisible()) {
      await prompt.getByRole('button', { name: 'Discard' }).click();
    }
  }

  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await expect(launcher.getByRole('listitem')).toHaveCount(0);
  await expect(
    page.locator('[data-notification-code="not_found"]'),
  ).toHaveCount(0);
  await expect(
    launcher.getByRole('button', { name: 'Open Folder' }),
  ).toBeDisabled();
});

test('FT-VS-08 keeps the close prompt until an explicit choice is made', async ({
  page,
}) => {
  await page.goto('/?close-plan');

  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('dirty before close');
  const tabItem = page.getByRole('tab').first().locator('..');
  await tabItem.getByRole('button', { name: /^Close /u }).click();

  const prompt = page.getByRole('dialog', {
    name: 'Save changes before closing?',
  });
  await expect(prompt).toBeVisible();
  // Cancel takes focus, so the box is answerable from the keyboard immediately.
  await expect(prompt.getByRole('button', { name: 'Cancel' })).toBeFocused();

  // A stray click outside must not answer a question about unsaved work.
  await page.mouse.click(20, 400);
  await expect(prompt).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(1);

  // Escape is the deliberate keyboard dismissal, and it cancels.
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(1);
});
