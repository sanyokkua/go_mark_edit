import type { Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '../support/harness';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

interface PreviewState {
  data?: {
    activeBuffer?: {
      content?: string;
    } | null;
  };
}

async function getState(page: Page): Promise<PreviewState> {
  return page.evaluate(async () => {
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
    return (await getState({ id: crypto.randomUUID() })) as PreviewState;
  });
}

test('case 7 serves bounded in-folder images and keeps every other source inert', async ({
  app,
}) => {
  const sourcePath = await app.writeDocument('D/a.md', '');
  await writeFile(
    join(app.documentDirectory, 'D', 'inside.png'),
    ONE_PIXEL_PNG,
  );
  await writeFile(join(app.documentDirectory, 'outside.png'), ONE_PIXEL_PNG);
  await writeFile(
    join(app.documentDirectory, 'D', 'huge.png'),
    Buffer.alloc(21 * 1024 * 1024),
  );

  const sourceContent = [
    '# Preview images',
    '',
    '![inside](./inside.png)',
    '![outside](../outside.png)',
    '![web](https://example.com/image.png)',
    '![huge](./huge.png)',
  ].join('\n');
  await writeFile(sourcePath, sourceContent, 'utf8');
  await app.seedRecents([sourcePath]);
  await app.launch();

  const { page } = app;
  const exampleRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.com')) {
      exampleRequests.push(request.url());
    }
  });

  const initialTab = page.getByRole('tab', { name: 'Untitled' });
  await initialTab
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();
  await page
    .getByTestId('document-launcher')
    .getByRole('button', { name: 'a.md' })
    .click();
  await expect(page.getByRole('tab', { name: 'a.md' })).toBeVisible();

  const arrangement = page.getByRole('radiogroup', {
    name: 'View arrangement',
  });
  await arrangement.getByRole('radio', { name: 'Preview' }).click();

  const preview = page.getByRole('region', { name: 'Preview pane' });
  const inside = preview.locator('img[alt="inside"]');
  await expect(inside).toHaveCount(1);
  await expect
    .poll(() =>
      inside.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  for (const alt of ['outside', 'web', 'huge']) {
    await expect(preview.getByRole('img', { name: alt })).toBeVisible();
    await expect(preview.locator(`img[alt="${alt}"]`)).toHaveCount(0);
  }
  await expect(
    preview.locator('[data-notification-code="preview-link-refused"]'),
  ).toHaveCount(0);
  expect(exampleRequests).toEqual([]);

  const untitledSource = '![untitled](./inside.png)';
  await page.getByRole('button', { name: 'New tab' }).click();
  await expect(page.getByRole('tab', { name: 'Untitled' })).toBeVisible();
  await arrangement.getByRole('radio', { name: 'Editor' }).click();
  const editorInput = page.locator('[data-editor-surface] textarea').first();
  await expect(editorInput).toBeVisible();
  await editorInput.focus();
  await editorInput.press('ControlOrMeta+A');
  await page.keyboard.insertText(untitledSource);
  await expect
    .poll(() =>
      getState(page).then((state) => state.data?.activeBuffer?.content),
    )
    .toBe(untitledSource);

  await arrangement.getByRole('radio', { name: 'Preview' }).click();
  const untitledPreview = page.getByRole('region', { name: 'Preview pane' });
  await expect(
    untitledPreview.getByRole('img', { name: 'untitled' }),
  ).toBeVisible();
  await expect(untitledPreview.locator('img[alt="untitled"]')).toHaveCount(0);
  await expect(
    untitledPreview.locator('[data-notification-code="preview-link-refused"]'),
  ).toHaveCount(0);
  expect(exampleRequests).toEqual([]);
});
