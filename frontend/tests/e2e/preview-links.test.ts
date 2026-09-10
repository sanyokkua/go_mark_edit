import type { Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { expect, test } from '../support/harness';

interface PreviewState {
  data?: {
    activeBuffer?: {
      content?: string;
      documentId?: string;
    } | null;
    snapshot?: {
      activeDocumentId?: string | null;
    };
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

async function clickWithoutNavigation(
  page: Page,
  link: ReturnType<Page['getByRole']>,
  originalUrl: string,
): Promise<void> {
  await expect(link).toBeVisible();
  await link.click();
  await expect.poll(() => page.url()).toBe(originalUrl);
}

async function expectOneAutoDismissingWarning(
  page: Page,
  target: string,
  reason: string,
): Promise<void> {
  const warnings = page.locator(
    '[data-notification-code="preview-link-refused"]',
  );
  const warning = warnings.filter({ hasText: target });

  await expect(warning).toHaveCount(1);
  await expect(warning).toContainText(reason);
  await expect(warnings).toHaveCount(1);
  await expect(warning).toHaveCount(0, { timeout: 10_000 });
}

test('case 1 keeps preview link activation in the app session', async ({
  app,
}) => {
  const outsidePath = join(app.tempDirectory, 'outside.md');
  const sourcePath = await app.writeDocument('D/a.md', '# placeholder');
  await app.writeDocument('D/next.md', '# sibling');
  await writeFile(outsidePath, '# outside', 'utf8');

  const outsideHref = relativeHref(sourcePath, outsidePath);
  const sourceContent = [
    '# Preview links',
    '[top](#top)',
    '[next](./next.md)',
    `[out](${outsideHref})`,
    '[web](https://example.com/docs)',
    '[mail](mailto:x@y)',
    '[file](file:///etc/hosts)',
    '',
    ...Array.from({ length: 80 }, (_, index) => [
      `filler line ${index + 1}`,
      '',
    ]).flat(),
    '',
    '## top',
    'anchor target',
  ].join('\n');
  await writeFile(sourcePath, sourceContent, 'utf8');

  await app.seedRecents([sourcePath]);
  await app.launch();

  const { page } = app;
  const originalUrl = page.url();
  const initialTab = page.getByRole('tab', { name: 'Untitled' });
  await initialTab
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();

  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await launcher.getByRole('button', { name: 'a.md' }).click();
  await expect(page.getByRole('tab', { name: 'a.md' })).toBeVisible();

  const arrangement = page.getByRole('radiogroup', {
    name: 'View arrangement',
  });
  await arrangement.getByRole('radio', { name: 'Preview' }).click();
  await expect(page.getByRole('link', { name: 'top' })).toBeVisible();

  await page.evaluate(() => {
    const root = globalThis as unknown as {
      runtime?: {
        BrowserOpenURL?: (url: string) => void;
      };
      __previewBrowserUrls?: string[];
    };
    const urls: string[] = [];
    if (root.runtime === undefined) {
      throw new Error('the Wails runtime object is absent');
    }
    root.runtime.BrowserOpenURL = (url: string): void => {
      urls.push(url);
    };
    root.__previewBrowserUrls = urls;
  });

  const sourceState = await getState(page);
  expect(sourceState.data?.activeBuffer?.content).toBe(sourceContent);
  expect(sourceState.data?.snapshot?.activeDocumentId).toBe(
    sourceState.data?.activeBuffer?.documentId,
  );

  const previewScroll = page.locator(
    'section[aria-label="Preview pane"] > div',
  );
  const scrollBeforeAnchor = await previewScroll.evaluate(
    (element) => (element as HTMLElement).scrollTop,
  );
  await clickWithoutNavigation(
    page,
    page.getByRole('link', { name: 'top' }),
    originalUrl,
  );
  await expect
    .poll(() =>
      previewScroll.evaluate((element) => (element as HTMLElement).scrollTop),
    )
    .toBeGreaterThan(scrollBeforeAnchor);
  await expect(page.locator('#top')).toBeVisible();

  await clickWithoutNavigation(
    page,
    page.getByRole('link', { name: 'web' }),
    originalUrl,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __previewBrowserUrls?: string[] })
            .__previewBrowserUrls ?? [],
      ),
    )
    .toEqual(['https://example.com/docs']);

  const tabCountBeforeRefusals = await page.getByRole('tab').count();
  await clickWithoutNavigation(
    page,
    page.getByRole('link', { name: 'out' }),
    originalUrl,
  );
  await expectOneAutoDismissingWarning(
    page,
    outsideHref,
    'outside the document folder',
  );
  await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeRefusals);
  await expect((await getState(page)).data?.activeBuffer?.content).toBe(
    sourceContent,
  );

  await clickWithoutNavigation(
    page,
    page.getByRole('link', { name: 'mail' }),
    originalUrl,
  );
  await expectOneAutoDismissingWarning(
    page,
    'mailto:x@y',
    'Only local documents and http(s) links are allowed',
  );
  await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeRefusals);

  await clickWithoutNavigation(
    page,
    page.getByRole('link', { name: 'file' }),
    originalUrl,
  );
  await expectOneAutoDismissingWarning(
    page,
    'file:///etc/hosts',
    'Only local documents and http(s) links are allowed',
  );
  await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeRefusals);
  await expect((await getState(page)).data?.activeBuffer?.content).toBe(
    sourceContent,
  );

  await clickWithoutNavigation(
    page,
    page.getByRole('link', { name: 'next' }),
    originalUrl,
  );
  await expect(page.getByRole('tab', { name: 'next.md' })).toBeVisible();

  await page.getByRole('button', { name: 'New tab' }).click();
  await expect(page.getByRole('tab', { name: 'Untitled' })).toBeVisible();
  await arrangement.getByRole('radio', { name: 'Editor' }).click();

  const editorInput = page.locator('[data-editor-surface] textarea').first();
  await expect(editorInput).toBeVisible();
  await editorInput.focus();
  await editorInput.press('ControlOrMeta+A');
  await page.keyboard.insertText('[rel](./next.md)');
  await expect
    .poll(() =>
      getState(page).then((state) => state.data?.activeBuffer?.content),
    )
    .toBe('[rel](./next.md)');

  await arrangement.getByRole('radio', { name: 'Preview' }).click();
  await clickWithoutNavigation(
    page,
    page.getByRole('link', { name: 'rel' }),
    originalUrl,
  );
  await expectOneAutoDismissingWarning(
    page,
    './next.md',
    'Relative links need a document folder',
  );
  await expect(page.getByRole('tab')).toHaveCount(tabCountBeforeRefusals + 2);
  await expect((await getState(page)).data?.activeBuffer?.content).toBe(
    '[rel](./next.md)',
  );
});

function relativeHref(fromPath: string, toPath: string): string {
  return relative(dirname(fromPath), toPath).replaceAll('\\', '/');
}
