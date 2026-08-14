import { expect, test, type Page } from '@playwright/test';

const viewports = [375, 768, 1280] as const;
const viewportHeight = 720;

async function chooseArrangement(
  page: Page,
  arrangement: 'Editor' | 'Split' | 'Preview',
): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) <= 376) {
    const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
    const overflow = toolbar.getByLabel('More actions');
    const isOpen = await overflow.evaluate(
      (trigger): boolean => trigger.closest('details')?.open ?? false,
    );
    if (!isOpen) {
      await overflow.click();
    }
    /*
     * The overflow popup is portalled into `.application-frame` so it shares
     * the frame's containing block, which puts the relocated arrangement radios
     * outside the toolbar element — scoping to `toolbar` found nothing. The
     * inline switch is hidden at this width (`mockup.html:76` `#viewseg`), so
     * the popup is the only place these radios exist.
     */
    await page
      .locator('[data-viewport-popup="editor-overflow"]')
      .getByRole('radiogroup', { name: 'View arrangement' })
      .getByRole('radio', { name: arrangement })
      .last()
      .click();
    return;
  }
  await page.getByRole('radio', { name: arrangement }).click();
}
// CI tolerance covering the frozen 150–300 ms accepted-preview target.
const acceptedPreviewCIToleranceMs = 500;

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message): void => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error): void => {
    errors.push(`page: ${error.message}`);
  });

  return errors;
}

async function expectCollapsedAssistant(page: Page): Promise<void> {
  const assistant = page.getByRole('complementary', {
    includeHidden: true,
    name: 'Assistant',
  });

  await expect(assistant).toBeHidden();
}

async function expectPaneVisibility(
  page: Page,
  expected: { editor: boolean; preview: boolean },
): Promise<void> {
  const editorPane = page.getByLabel('Editor pane', { exact: true });
  const previewPane = page.getByLabel('Preview pane', { exact: true });

  if (expected.editor) {
    await expect(editorPane).toBeVisible();
  } else {
    await expect(editorPane).toBeHidden();
  }

  if (expected.preview) {
    await expect(previewPane).toBeVisible();
  } else {
    await expect(previewPane).toHaveCount(0);
  }

  await expectCollapsedAssistant(page);
}

async function statePatchCount(page: Page): Promise<number> {
  return page.evaluate((): number => {
    const mirrorWindow = window as Window & {
      readonly __GME_STATE_PATCHES__?: readonly unknown[];
    };

    return mirrorWindow.__GME_STATE_PATCHES__?.length ?? 0;
  });
}

async function expectContentFreeMetadataPatchSince(
  page: Page,
  patchCount: number,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate((from: number): boolean => {
        const mirrorWindow = window as Window & {
          readonly __GME_STATE_PATCHES__?: readonly unknown[];
        };
        const patches = mirrorWindow.__GME_STATE_PATCHES__ ?? [];

        function containsContent(value: unknown): boolean {
          if (Array.isArray(value)) {
            return value.some(containsContent);
          }
          if (typeof value !== 'object' || value === null) {
            return false;
          }

          return Object.entries(value).some(
            ([key, child]): boolean =>
              key === 'content' || containsContent(child),
          );
        }

        return patches.slice(from).some((patch: unknown): boolean => {
          if (containsContent(patch)) {
            return false;
          }
          const documents =
            typeof patch === 'object' && patch !== null
              ? (patch as Record<string, unknown>).documents
              : undefined;
          const upsert =
            typeof documents === 'object' && documents !== null
              ? (documents as Record<string, unknown>).upsert
              : undefined;
          const document =
            typeof upsert === 'object' && upsert !== null
              ? (upsert as Record<string, unknown>)['mock-document']
              : undefined;

          return (
            typeof document === 'object' &&
            document !== null &&
            (document as Record<string, unknown>).dirty === true
          );
        });
      }, patchCount),
    )
    .toBe(true);
}

async function expectViewPatchSince(
  page: Page,
  patchCount: number,
  expected: { editor: boolean; preview: boolean },
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        ({
          expectedState,
          from,
        }: {
          expectedState: { editor: boolean; preview: boolean };
          from: number;
        }): boolean => {
          const mirrorWindow = window as Window & {
            readonly __GME_STATE_PATCHES__?: readonly unknown[];
          };
          const patches = mirrorWindow.__GME_STATE_PATCHES__ ?? [];

          return patches.slice(from).some((patch: unknown): boolean => {
            if (typeof patch !== 'object' || patch === null) {
              return false;
            }
            const documents = (patch as Record<string, unknown>).documents;
            if (typeof documents !== 'object' || documents === null) {
              return false;
            }
            const upsert = (documents as Record<string, unknown>).upsert;
            if (typeof upsert !== 'object' || upsert === null) {
              return false;
            }
            const document = (upsert as Record<string, unknown>)[
              'mock-document'
            ];
            if (typeof document !== 'object' || document === null) {
              return false;
            }
            const view = (document as Record<string, unknown>).view;

            return (
              typeof view === 'object' &&
              view !== null &&
              (view as Record<string, unknown>).editorVisible ===
                expectedState.editor &&
              (view as Record<string, unknown>).previewVisible ===
                expectedState.preview
            );
          });
        },
        { expectedState: expected, from: patchCount },
      ),
    )
    .toBe(true);
}

// Proves: STORY-018-AC-1
test('STORY-018-AC-1 verifies responsive editor dimensions', async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);

  for (const width of viewports) {
    await page.setViewportSize({ width, height: viewportHeight });
    await page.goto('/');

    const editor = page.getByLabel('Editor pane', { exact: true });
    const monaco = page.locator('.monaco-editor');
    await expect(editor).toBeVisible();
    await expect(monaco).toBeVisible();

    const bounds = await monaco.boundingBox();
    expect(bounds?.height).toBeGreaterThan(200);
    await expect
      .poll(() =>
        page.evaluate(
          (): boolean =>
            document.documentElement.scrollWidth <= window.innerWidth &&
            document.body.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await expectCollapsedAssistant(page);
  }

  expect(runtimeErrors).toEqual([]);
});

// Proves: STORY-022-AC-5
test('STORY-022-AC-5 round trips an edit through Preview responsively', async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);

  for (const width of viewports) {
    const source = `round-trip-${width}`;
    await page.setViewportSize({ width, height: viewportHeight });
    await page.goto('/');

    const editorPane = page.getByLabel('Editor pane', { exact: true });
    const previewPane = page.getByLabel('Preview pane', { exact: true });
    const monaco = page.locator('.monaco-editor');
    const input = monaco.locator('textarea.inputarea');
    await expect(monaco).toBeVisible();
    await input.focus();
    await page.keyboard.insertText(source);
    await expect(monaco.locator('.view-lines')).toContainText(source);

    await chooseArrangement(page, 'Preview');
    await expect(editorPane).toBeHidden();
    await expect(monaco).toBeHidden();
    await expect(previewPane).toContainText(source);

    await chooseArrangement(page, 'Editor');
    await expect(editorPane).toBeVisible();
    await expect(monaco).toBeVisible();
    await expect(monaco.locator('.view-lines')).toContainText(source);
    const bounds = await monaco.boundingBox();
    expect(bounds?.height).toBeGreaterThan(200);

    await input.focus();
    await expect(input).toBeFocused();
    const modifier = await page.evaluate(() =>
      /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control',
    );
    await input.press(`${modifier}+z`);
    await chooseArrangement(page, 'Split');
    if (width <= 376) {
      /*
       * At the minimum window Split collapses to the editor and the preview is
       * removed from the tree, per the approved 2026-08-14 clarification. The
       * round trip still has to be provable, so it is checked through Preview
       * mode — the assertion's purpose, not its old surface.
       */
      await expect(previewPane).toHaveCount(0);
      await expect(editorPane).toBeVisible();
      await chooseArrangement(page, 'Preview');
    } else {
      await expect(previewPane).toBeVisible();
    }
    await expect(previewPane).not.toContainText(source);
    await expect
      .poll(() =>
        page.evaluate(
          (): boolean =>
            document.documentElement.scrollWidth <= window.innerWidth &&
            document.body.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }

  expect(runtimeErrors).toEqual([]);
});

// Proves: STORY-022-AC-4
test('STORY-022-AC-4 (EC-DOCS-12) keeps a focused Monaco source, caret, and selection across a metadata patch', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: viewportHeight });
  await page.goto('/');

  const monaco = page.locator('.monaco-editor');
  const input = monaco.locator('textarea.inputarea');
  const source = 'focused local working edit';
  const patchCount = await statePatchCount(page);
  await input.click({ force: true });
  await page.keyboard.insertText(source);
  await input.focus();
  await input.press('Shift+ArrowLeft');
  await expect
    .poll(() =>
      monaco.evaluate((node: Element): boolean =>
        Array.from(
          node.querySelectorAll<HTMLElement>('.selected-text'),
          (element: HTMLElement): boolean => {
            const bounds = element.getBoundingClientRect();

            return bounds.width > 0 && bounds.height > 0;
          },
        ).some(Boolean),
      ),
    )
    .toBe(true);

  const sessionBeforePatch = await monaco.evaluate(
    (
      node: Element,
    ): {
      caret: { left: number; top: number };
      focused: boolean;
      selection: Array<{
        height: number;
        left: number;
        top: number;
        width: number;
      }>;
      source: string;
    } => {
      const editorInput = node.querySelector('textarea.inputarea');
      const caret = node.querySelector<HTMLElement>('.cursor');
      const sourceText = node.querySelector('.view-lines')?.textContent;
      if (
        editorInput === null ||
        caret === null ||
        sourceText === null ||
        sourceText === undefined
      ) {
        throw new Error('Monaco focused-session DOM is unavailable');
      }
      const caretBounds = caret.getBoundingClientRect();
      const selection = Array.from(
        node.querySelectorAll<HTMLElement>('.selected-text'),
        (element: HTMLElement) => {
          const bounds = element.getBoundingClientRect();

          return {
            height: bounds.height,
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
          };
        },
      );

      return {
        caret: { left: caretBounds.left, top: caretBounds.top },
        focused: document.activeElement === editorInput,
        selection,
        source: sourceText,
      };
    },
  );
  expect(sessionBeforePatch.focused).toBe(true);
  expect(sessionBeforePatch.selection.length).toBeGreaterThan(0);
  expect(sessionBeforePatch.source.replaceAll('\u00a0', ' ')).toContain(source);

  await expectContentFreeMetadataPatchSince(page, patchCount);

  const sessionAfterPatch = await monaco.evaluate(
    (
      node: Element,
    ): {
      caret: { left: number; top: number };
      focused: boolean;
      selection: Array<{
        height: number;
        left: number;
        top: number;
        width: number;
      }>;
      source: string;
    } => {
      const editorInput = node.querySelector('textarea.inputarea');
      const caret = node.querySelector<HTMLElement>('.cursor');
      const sourceText = node.querySelector('.view-lines')?.textContent;
      if (
        editorInput === null ||
        caret === null ||
        sourceText === null ||
        sourceText === undefined
      ) {
        throw new Error('Monaco focused-session DOM is unavailable');
      }
      const caretBounds = caret.getBoundingClientRect();
      const selection = Array.from(
        node.querySelectorAll<HTMLElement>('.selected-text'),
        (element: HTMLElement) => {
          const bounds = element.getBoundingClientRect();

          return {
            height: bounds.height,
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
          };
        },
      );

      return {
        caret: { left: caretBounds.left, top: caretBounds.top },
        focused: document.activeElement === editorInput,
        selection,
        source: sourceText,
      };
    },
  );

  expect(sessionAfterPatch).toEqual(sessionBeforePatch);
});

// Proves: STORY-018-AC-2
test('STORY-018-AC-2 verifies the live editor preview flow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: viewportHeight });
  await page.goto('/');

  const monaco = page.locator('.monaco-editor');
  await expect(monaco).toBeVisible();
  await monaco.locator('textarea.inputarea').click({ force: true });
  const previewStartedAt = Date.now();
  await page.keyboard.type('# Hello');

  await Promise.all([
    expect(page.getByRole('heading', { level: 1, name: 'Hello' })).toBeVisible({
      timeout: acceptedPreviewCIToleranceMs,
    }),
    expect(page.getByLabel('Document status', { exact: true })).toContainText(
      '2 words',
      { timeout: acceptedPreviewCIToleranceMs },
    ),
  ]);
  expect(Date.now() - previewStartedAt).toBeLessThanOrEqual(
    acceptedPreviewCIToleranceMs,
  );

  await expect
    .poll(
      () =>
        page.evaluate((): boolean => {
          const mirrorWindow = window as Window & {
            readonly __GME_STATE_PATCHES__?: readonly unknown[];
          };
          const patches = mirrorWindow.__GME_STATE_PATCHES__ ?? [];

          return patches.some((patch: unknown): boolean => {
            if (typeof patch !== 'object' || patch === null) {
              return false;
            }
            const documents = (patch as Record<string, unknown>).documents;
            if (typeof documents !== 'object' || documents === null) {
              return false;
            }
            const upsert = (documents as Record<string, unknown>).upsert;
            if (typeof upsert !== 'object' || upsert === null) {
              return false;
            }
            const document = (upsert as Record<string, unknown>)[
              'mock-document'
            ];

            return (
              typeof document === 'object' &&
              document !== null &&
              (document as Record<string, unknown>).dirty === true &&
              (document as Record<string, unknown>).wordCount === 2
            );
          });
        }),
      { timeout: acceptedPreviewCIToleranceMs },
    )
    .toBe(true);

  const patchMirrorProof = await page.evaluate(
    (): {
      allPatchesFrozen: boolean;
      contentFree: boolean;
      mirrorFrozen: boolean;
    } => {
      const mirrorWindow = window as Window & {
        readonly __GME_STATE_PATCHES__?: readonly unknown[];
      };
      const patches = mirrorWindow.__GME_STATE_PATCHES__ ?? [];

      function hasContentKey(value: unknown): boolean {
        if (Array.isArray(value)) {
          return value.some(hasContentKey);
        }
        if (typeof value !== 'object' || value === null) {
          return false;
        }

        return Object.entries(value).some(
          ([key, child]): boolean => key === 'content' || hasContentKey(child),
        );
      }

      return {
        allPatchesFrozen: patches.every(Object.isFrozen),
        contentFree: !hasContentKey(patches),
        mirrorFrozen: Object.isFrozen(patches),
      };
    },
  );
  expect(patchMirrorProof).toEqual({
    allPatchesFrozen: true,
    contentFree: true,
    mirrorFrozen: true,
  });
});

// Proves: STORY-018-AC-3
test('STORY-018-AC-3 matches the approved split-view reference', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: viewportHeight });
  await page.goto('/');

  await expect(
    page.getByRole('complementary', { name: 'Workspace' }),
  ).toBeAttached();
  await expect(page.getByRole('main', { name: 'Document area' })).toBeVisible();
  await expect(page.getByLabel('Editor view', { exact: true })).toBeVisible();
  await expect(
    page.getByLabel('Document toolbar', { exact: true }),
  ).toBeVisible();

  const viewArrangement = page.getByRole('radiogroup', {
    name: 'View arrangement',
  });
  await expect(viewArrangement.getByRole('radio')).toHaveCount(3);
  await expect(
    viewArrangement.getByRole('radio', { name: 'Split' }),
  ).toBeChecked();

  const editorPane = page.getByLabel('Editor pane', { exact: true });
  await expect(editorPane).toContainText('Editor · Untitled');
  await expect(editorPane).toContainText('UTF-8 · LF');

  const previewPane = page.getByLabel('Preview pane', { exact: true });
  await expect(previewPane).toContainText('● Preview · live');
  await expect(previewPane).toContainText('GFM');
  /*
   * The arrangement is asserted on the View arrangement radiogroup above, not
   * here: the binding's status row draws no arrangement label
   * (`mockup.html:837-845` is standard-kind, caret, count, spacer, encoding,
   * EOL, autosave, warnings, provider, Reading pill), and production stopped
   * duplicating it there when the row converged on that inventory.
   */
  await expectCollapsedAssistant(page);

  const [
    explorerBounds,
    documentBounds,
    toolbarBounds,
    editorBounds,
    previewBounds,
    statusBounds,
    dividerBounds,
  ] = await Promise.all([
    page.getByRole('complementary', { name: 'Workspace' }).boundingBox(),
    page.getByRole('main', { name: 'Document area' }).boundingBox(),
    page.getByLabel('Document toolbar', { exact: true }).boundingBox(),
    editorPane.boundingBox(),
    previewPane.boundingBox(),
    page.getByLabel('Document status', { exact: true }).boundingBox(),
    page.getByRole('separator', { name: 'Resize workspace' }).boundingBox(),
  ]);

  expect(explorerBounds).not.toBeNull();
  expect(documentBounds).not.toBeNull();
  expect(toolbarBounds).not.toBeNull();
  expect(editorBounds).not.toBeNull();
  expect(previewBounds).not.toBeNull();
  expect(statusBounds).not.toBeNull();
  expect(dividerBounds).not.toBeNull();
  if (
    explorerBounds === null ||
    documentBounds === null ||
    toolbarBounds === null ||
    editorBounds === null ||
    previewBounds === null ||
    statusBounds === null ||
    dividerBounds === null
  ) {
    throw new Error('Core editor layout bounds are unavailable');
  }
  /*
   * FR-FT-046: the divider overlays the boundary "without consuming layout
   * width". So it straddles the document's leading edge rather than sitting
   * entirely before it — `AppShell.module.css` places it absolutely at
   * `calc(var(--shell-workspace-column) - var(--shell-divider-width) / 2)`.
   * Asserting `documentBounds.x === dividerBounds.x + dividerBounds.width`
   * described the older divider that took a column of its own.
   */
  expect(dividerBounds.x + dividerBounds.width / 2).toBeCloseTo(
    documentBounds.x,
    1,
  );
  expect(dividerBounds.x).toBeLessThan(documentBounds.x);
  expect(dividerBounds.x + dividerBounds.width).toBeGreaterThan(
    documentBounds.x,
  );
  expect(documentBounds.y + documentBounds.height).toBe(viewportHeight);
  expect(editorBounds.y).toBeGreaterThanOrEqual(
    toolbarBounds.y + toolbarBounds.height,
  );
  expect(editorBounds.width).toBeCloseTo(previewBounds.width, 0);
  expect(statusBounds.y + statusBounds.height).toBe(viewportHeight);

  await expect(page).toHaveScreenshot('core-editor-split-1280.png', {
    fullPage: false,
  });
});

// Proves: STORY-032-AC-3
// This deterministic candidate is presented for product-owner review; the test never approves it.
test('STORY-032-AC-3 presents deterministic 1280x720 candidate for owner approval', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: viewportHeight });
  await page.goto('/');

  await expect(page.getByRole('main', { name: 'Document area' })).toBeVisible();
  await expect(page.getByLabel('Editor pane', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Preview pane', { exact: true })).toBeVisible();
  /*
   * Split is asserted on the control that owns it. The binding's status row
   * carries no arrangement label (`mockup.html:837-845`), so reading it back
   * from there asserted a surface that no longer exists.
   */
  await expect(
    page
      .getByRole('radiogroup', { name: 'View arrangement' })
      .getByRole('radio', { name: 'Split' }),
  ).toBeChecked();
  await page.screenshot({
    path: 'test-results/phase01-owner-candidate-1280x720.png',
    fullPage: false,
  });
});

// Proves: STORY-018-AC-4
test('STORY-018-AC-4 verifies view-mode and View-menu interaction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: viewportHeight });
  await page.goto('/');

  const editor = page.getByRole('radio', { name: 'Editor' });
  const editorPatchCount = await statePatchCount(page);
  await editor.click();
  await expect(editor).toBeChecked();
  await expectPaneVisibility(page, { editor: true, preview: false });
  await expectViewPatchSince(page, editorPatchCount, {
    editor: true,
    preview: false,
  });

  const splitPatchCount = await statePatchCount(page);
  await editor.press('ArrowRight');
  const split = page.getByRole('radio', { name: 'Split' });
  await expect(split).toBeChecked();
  await expectPaneVisibility(page, { editor: true, preview: true });
  await expectViewPatchSince(page, splitPatchCount, {
    editor: true,
    preview: true,
  });

  const previewPatchCount = await statePatchCount(page);
  await split.press('End');
  const preview = page.getByRole('radio', { name: 'Preview' });
  await expect(preview).toBeChecked();
  await expectPaneVisibility(page, { editor: false, preview: true });
  await expectViewPatchSince(page, previewPatchCount, {
    editor: false,
    preview: true,
  });

  const viewTrigger = page.getByRole('button', { name: 'View' });
  await viewTrigger.click();
  const viewMenu = page.getByRole('menu', { name: 'View options' });
  const viewArrangement = viewMenu.getByRole('group', {
    name: 'View arrangement',
  });
  const menuEditor = viewArrangement.getByRole('menuitemradio', {
    name: 'Editor',
  });
  const menuPreview = viewArrangement.getByRole('menuitemradio', {
    name: 'Preview',
  });
  await expect(menuEditor).toHaveAttribute('data-state', 'unchecked');
  await expect(menuPreview).toHaveAttribute('data-state', 'checked');

  const showEditorPatchCount = await statePatchCount(page);
  await menuEditor.click();
  await expectPaneVisibility(page, { editor: true, preview: false });
  await expectViewPatchSince(page, showEditorPatchCount, {
    editor: true,
    preview: false,
  });

  await viewTrigger.click();
  await expect(viewMenu).toBeVisible();
  await expect(menuEditor).toHaveAttribute('data-state', 'checked');
  await expect(menuPreview).toHaveAttribute('data-state', 'unchecked');
});
