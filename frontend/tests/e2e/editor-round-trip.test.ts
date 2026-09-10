import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import { expect, test } from '../support/harness';

interface ActiveState {
  data?: {
    activeBuffer?: {
      content?: string;
    } | null;
  };
}

async function activeBufferContent(page: Page): Promise<string> {
  return page.evaluate(async (): Promise<string> => {
    const root = globalThis as unknown as {
      go?: {
        appmodel?: {
          AppModelHandler?: {
            GetState?: (request: { id: string }) => Promise<unknown>;
          };
        };
      };
    };
    const getState = root.go?.appmodel?.AppModelHandler?.GetState;
    if (getState === undefined) {
      throw new Error(
        'the generated AppModelHandler.GetState binding is absent',
      );
    }
    const state = (await getState({ id: crypto.randomUUID() })) as ActiveState;
    return state.data?.activeBuffer?.content ?? '';
  });
}

async function editorModifier(page: Page): Promise<'Control' | 'Meta'> {
  return page.evaluate(() =>
    navigator.userAgent.includes('Macintosh') ? 'Meta' : 'Control',
  );
}

async function closeUntitled(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: /Untitled/u });
  await expect(tab).toBeVisible();
  await tab
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
}

async function openRecent(page: Page, filename: string): Promise<void> {
  await closeUntitled(page);
  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await launcher.getByRole('button', { name: filename, exact: true }).click();
  await expect(page.getByRole('tab', { name: filename })).toBeVisible();
}

async function disableAutosave(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Settings menu' });
  const autosave = menu.getByRole('checkbox', { name: 'Autosave' });
  if (await autosave.isChecked()) {
    await menu.locator('[data-settings-toggle="Autosave"]').click();
  }
  await page.keyboard.press('Escape');
}

async function editorCaret(page: Page): Promise<{
  left: number;
  top: number;
}> {
  const caret = page.locator('[data-editor-surface] .cursor').first();
  await expect(caret).toBeVisible();
  const bounds = await caret.boundingBox();
  if (bounds === null) throw new Error('the Monaco caret has no layout bounds');
  return { left: bounds.x, top: bounds.y };
}

test('keeps the real editor model, undo history, caret, and focus across Save', async ({
  app,
}) => {
  const original = '# Round trip\n\nA paragraph.';
  const edited = 'X';
  const source = await app.writeDocument('round-trip.md', original);
  await app.seedRecents([source]);
  await app.launch();

  const { page } = app;
  await openRecent(page, 'round-trip.md');
  await disableAutosave(page);
  const modifier = await editorModifier(page);

  const editor = page.locator('[data-editor-surface] textarea').first();
  await expect(editor).toBeVisible();
  await page.locator('[data-editor-surface] .view-lines').first().click();
  await expect(editor).toBeFocused();
  await expect.poll(() => activeBufferContent(page)).toBe(original);
  await editor.press(`${modifier}+A`);
  await page.keyboard.type(edited);
  await expect.poll(() => activeBufferContent(page)).toBe(edited);

  const caretBeforeSave = await editorCaret(page);
  await expect(editor).toBeFocused();
  await page.keyboard.press('ControlOrMeta+S');
  await expect(
    page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);
  await expect(page.locator('[aria-label="Document identity"]')).toContainText(
    'Saved',
  );
  await expect(editor).toBeFocused();
  const caretAfterSave = await editorCaret(page);
  expect(caretAfterSave).toEqual(caretBeforeSave);

  // A remounted Monaco model would have no edit history, so this would leave
  // the just-saved text in place instead of undoing the edit.
  await editor.press(`${modifier}+z`);
  await expect.poll(() => activeBufferContent(page)).toBe(original);
  await expect(editor).toBeFocused();
  await expect(page.locator('[aria-label="Document identity"]')).toContainText(
    'Unsaved changes',
  );

  expect(await readFile(source, 'utf8')).toBe(edited);
});

test('keeps live Preview and Monaco focus while Save delivers metadata', async ({
  app,
}) => {
  const original = '# Preview heading\n\nInitial paragraph.\n';
  const source = await app.writeDocument('preview-round-trip.md', original);
  await app.seedRecents([source]);
  await app.launch();

  const { page } = app;
  await openRecent(page, 'preview-round-trip.md');
  await disableAutosave(page);
  const modifier = await editorModifier(page);
  const arrangement = page.getByRole('radiogroup', {
    name: 'View arrangement',
  });
  await arrangement.getByRole('radio', { name: 'Split' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preview heading' }),
  ).toBeVisible();

  const editor = page.locator('[data-editor-surface] textarea').first();
  await editor.focus();
  const edited = '# Preview heading\n\nInitial paragraph.\n\nLive preview edit';
  await editor.press(`${modifier}+A`);
  await page.keyboard.insertText(edited);
  await expect.poll(() => activeBufferContent(page)).toBe(edited);
  await expect(
    page.getByRole('region', { name: 'Preview pane' }),
  ).toContainText('Live preview edit');
  const caretBeforeSave = await editorCaret(page);

  await page.keyboard.press('ControlOrMeta+S');
  await expect(
    page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Preview heading' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Preview pane' }),
  ).toContainText('Live preview edit');
  await expect(editor).toBeFocused();
  expect(await editorCaret(page)).toEqual(caretBeforeSave);
});
