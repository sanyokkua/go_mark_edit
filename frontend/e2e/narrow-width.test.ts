import { expect, test, type Locator, type Page } from '@playwright/test';

import { expectPainted } from './painted';

/*
 * The responsive sweep the audit at
 * `specs/003-real-files-and-tabs/evidence/ft-vs-08/phase-18/t084-coverage-rescope.md`
 * left open: five states that nothing measured at 768 or 375.
 *
 * `editor-stage.test.ts` and `window-shell.test.ts` already iterate
 * [1280, 768, 375] over the shell, the menus and the chrome hierarchy, so
 * nothing here repeats those. What is here is what only exists at a narrow
 * width: which toolbar actions survive the drop order, whether a prompt or the
 * launcher still fits and still works at 768, whether the preview is reachable
 * once the inline arrangement switch is gone, and whether any chrome row wraps.
 *
 * The application's native minimum window is 375x480 (`main.go:104-105`), and
 * the minimum presentation owns widths <= 376 (`ui/widgets/minimumWindow.ts`).
 */

const VIEWPORT_HEIGHT = 720;

/**
 * Every action the toolbar surface owns, at any width. The union of what the
 * toolbar row still shows and what the overflow menu carries must be exactly
 * this list — that is what makes the per-width assertions below exhaustive
 * rather than a sample.
 */
const TOOLBAR_INVENTORY = [
  'bold',
  'italic',
  'strike',
  'inline-code',
  'heading-1',
  'heading-2',
  'heading-3',
  'bullet-list',
  'numbered-list',
  'task-list',
  'quote',
  'link',
  'image',
  'table',
  'format',
  'compact',
  'lint',
  'editor',
  'split',
  'preview',
] as const;

/**
 * The 14 actions the narrow overflow must carry at 375. Bold, Italic,
 * Strikethrough, Inline code and the three headings are in this list because
 * they were *missing* from it in the shipped build for weeks: the toolbar row
 * dropped them at 375 and the overflow drawn there was the parity stand-in,
 * which has no text or heading group. `EditorChrome.test.tsx` pins the bucket
 * assignment; this pins what a user at 375 can actually reach.
 */
const OVERFLOW_ACTIONS_AT_375 = [
  'bullet-list',
  'numbered-list',
  'task-list',
  'quote',
  'link',
  'image',
  'table',
  'bold',
  'italic',
  'strike',
  'inline-code',
  'heading-1',
  'heading-2',
  'heading-3',
] as const;

/**
 * At 768 only the list and insert groups relocate
 * (`EditorChrome.module.css:532-540`); the text, heading and deferred groups
 * and the arrangement segment stay in the row.
 */
const OVERFLOW_ACTIONS_AT_768 = [
  'bullet-list',
  'numbered-list',
  'task-list',
  'quote',
  'link',
  'image',
  'table',
] as const;

interface OverflowInventory {
  readonly actions: readonly string[];
  readonly disabled: readonly string[];
  readonly arrangement: readonly string[];
  readonly applicationMenus: readonly string[];
}

async function visibleActionIds(scope: Locator): Promise<string[]> {
  return scope.evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>('[data-action-id]'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => node.getAttribute('data-action-id') ?? ''),
  );
}

async function overflowInventory(popup: Locator): Promise<OverflowInventory> {
  return popup.evaluate((element) => {
    const laidOut = (node: Element): boolean => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const controls = Array.from(
      element.querySelectorAll<HTMLElement>('[data-action-id]'),
    ).filter(laidOut);
    const id = (node: HTMLElement): string =>
      node.getAttribute('data-action-id') ?? '';
    return {
      actions: controls
        .filter((node) => node.getAttribute('role') !== 'radio')
        .map(id),
      disabled: controls
        .filter((node) => (node as HTMLButtonElement).disabled)
        .map(id),
      arrangement: controls
        .filter((node) => node.getAttribute('role') === 'radio')
        .map(id),
      applicationMenus: Array.from(
        element.querySelectorAll<HTMLElement>(
          '[data-application-overflow-action]',
        ),
      )
        .filter(laidOut)
        .map((node) => node.getAttribute('data-application-overflow-action')!),
    };
  });
}

async function expectNoHorizontalPageScroll(
  page: Page,
  width: number,
): Promise<void> {
  const measured = await page.evaluate(() => ({
    documentElement: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(measured.documentElement).toBeLessThanOrEqual(width);
  expect(measured.body).toBeLessThanOrEqual(width);
}

/**
 * FR-FT-046 asks for two different things — inside the viewport, and not
 * clipped — and until T126 this helper measured only the first. Every
 * assertion in it is `boundingBox()` arithmetic, and a box survives an
 * ancestor clipping it to nothing, which is exactly the T113 defect. So the
 * paint check runs here too: one helper, both halves of the rule.
 *
 * Proven load-bearing against the launcher and the paused preview bar: with
 * the clipping ancestor injected, every bounds assertion below stays green
 * while `expectPainted` reports the topmost paint at the centre is something
 * else.
 */
async function expectInsideViewport(
  locator: Locator,
  width: number,
  label = 'the surface',
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
  await expectPainted(locator, `${label} at ${width}px`);
}

/**
 * The View menu is the only route to the arrangement at the minimum window:
 * the inline segment carries `relocateAt375` and the whole application menu row
 * collapses to one overflow trigger there.
 */
async function openViewMenu(page: Page, width: number): Promise<Locator> {
  if (width <= 376) {
    await page
      .getByRole('navigation', { name: 'Application actions' })
      .getByRole('button', { name: 'More actions' })
      .click();
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'View', exact: true }).click();
  }
  const view = page.getByRole('menu', { name: 'View options' });
  await expect(view).toBeVisible();
  return view;
}

async function openToolbarOverflow(page: Page): Promise<Locator> {
  await page
    .getByRole('toolbar', { name: 'Document toolbar' })
    .getByLabel('More actions')
    .click();
  const popup = page.locator('[data-viewport-popup="editor-overflow"]');
  await expect(popup).toBeVisible();
  // T126: the overflow menu is the only route to a relocated action at this
  // width, so it has to paint, not merely have a box.
  await expectPainted(popup, 'the toolbar overflow popup');
  return popup;
}

/* ------------------------------------------------------------------ *
 * Gap 9 — the toolbar drop order, by action id.
 * ------------------------------------------------------------------ */

// Proves: FR-FT-046 (partial — reachability and, since T126, that the overflow popup carrying the relocated actions actually paints unclipped, at 375)
test('T084 375px reaches every relocated toolbar action through the overflow menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT });
  await page.goto('/');

  const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
  await expect(toolbar).toBeVisible();

  /*
   * The inline arrangement switch is not drawn at the minimum window — the
   * segment carries `relocateAt375` — so the only controls left in the row are
   * the three deferred ones the binding keeps there.
   */
  await expect(
    toolbar.getByRole('radiogroup', { name: 'View arrangement' }),
  ).toBeHidden();
  const rowActions = await visibleActionIds(toolbar);
  expect(rowActions).toEqual(['format', 'compact', 'lint']);

  const popup = await openToolbarOverflow(page);
  const inventory = await overflowInventory(popup);

  // Whole sets, not `toContain`: a future removal has to fail here.
  expect(inventory.actions).toEqual([...OVERFLOW_ACTIONS_AT_375]);
  expect(inventory.arrangement).toEqual(['editor', 'split', 'preview']);
  expect(inventory.applicationMenus).toEqual([
    'file',
    'settings',
    'view',
    'about',
  ]);
  /*
   * Availability comes from the registry, not from whether a handler is wired:
   * `logic/actions/actionRegistry.ts:349` marks `image`
   * deferred (`image-lifecycle-deferred`). Everything else the overflow carries
   * is operable.
   */
  expect(inventory.disabled).toEqual(['image']);

  // Nothing in the toolbar's inventory is unreachable at this width.
  expect(
    [...rowActions, ...inventory.actions, ...inventory.arrangement].sort(),
  ).toEqual([...TOOLBAR_INVENTORY].sort());

  // And a relocated action still edits: the drop order moves controls, it does
  // not turn them into pictures.
  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('narrow');
  await editor.press('ControlOrMeta+A');
  await popup.getByRole('button', { name: 'Bold' }).click();
  await expect(editor).toHaveValue('**narrow**');

  await expectNoHorizontalPageScroll(page, 375);
});

// Proves: FR-FT-046 (partial — reachability and, since T126, that the overflow popup carrying the relocated actions actually paints unclipped, at 768)
test('T084 768px relocates exactly the list and insert groups to the overflow menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: VIEWPORT_HEIGHT });
  await page.goto('/');

  const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
  await expect(toolbar).toBeVisible();
  // The arrangement segment survives at 768; only 375 takes it away.
  await expect(
    toolbar.getByRole('radiogroup', { name: 'View arrangement' }),
  ).toBeVisible();

  const rowActions = await visibleActionIds(toolbar);
  expect(rowActions).toEqual([
    'bold',
    'italic',
    'strike',
    'inline-code',
    'heading-1',
    'heading-2',
    'heading-3',
    'format',
    'compact',
    'lint',
    'editor',
    'split',
    'preview',
  ]);

  const popup = await openToolbarOverflow(page);
  const inventory = await overflowInventory(popup);

  expect(inventory.actions).toEqual([...OVERFLOW_ACTIONS_AT_768]);
  expect(inventory.disabled).toEqual(['image']);
  /*
   * The arrangement radios and the four application menus are the minimum
   * window's additions — `.overflowAt375` and `.applicationOverflowItems` are
   * both `display: none` above 376px
   * (`EditorChrome.module.css:448-449, 566-570`), because at 768 the row and
   * the application menu bar still carry them.
   */
  expect(inventory.arrangement).toEqual([]);
  expect(inventory.applicationMenus).toEqual([]);

  expect([...rowActions, ...inventory.actions].sort()).toEqual(
    [...TOOLBAR_INVENTORY].sort(),
  );

  await expectNoHorizontalPageScroll(page, 768);
});

/* ------------------------------------------------------------------ *
 * Gap 10 — no unintended wrapping in any chrome row.
 * ------------------------------------------------------------------ */

/*
 * `items` is the exact number of laid-out controls each row carries at each
 * width, on the default single-document route. It is asserted so the wrapping
 * checks below cannot pass vacuously on a row that has quietly emptied — the
 * minimum window collapses the whole application menu bar to one overflow
 * trigger and the toolbar to three deferred controls plus its own trigger, and
 * an assertion that "nothing wrapped" would be true of an empty row too.
 */
const CHROME_ROWS = [
  {
    name: 'menu row',
    role: 'navigation',
    label: 'Application actions',
    items: { 768: 6, 375: 1 },
  },
  {
    name: 'tab strip',
    role: 'tablist',
    label: 'Document tabs',
    items: { 768: 3, 375: 3 },
  },
  {
    name: 'toolbar',
    role: 'toolbar',
    label: 'Document toolbar',
    items: { 768: 14, 375: 4 },
  },
  {
    name: 'status row',
    role: 'status',
    label: 'Document status',
    items: { 768: 7, 375: 3 },
  },
] as const;

for (const width of [768, 375] as const) {
  for (const row of CHROME_ROWS) {
    // Proves: FR-FT-046 (partial — 768 and 375 no-wrap and no page scroll; 1280 and the divider are covered by siblings)
    test(`T084 ${width}px keeps the ${row.name} on one unwrapped line`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.goto('/');
      const locator = page.getByRole(row.role, {
        name: row.label,
        exact: true,
      });
      await expect(locator).toBeVisible();

      const measured = await locator.evaluate((element) => {
        const items = Array.from(
          element.querySelectorAll<HTMLElement>(
            '[data-status-item], [role="tab"], button, summary',
          ),
        ).filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        return {
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          flexWrap: getComputedStyle(element).flexWrap,
          items: items.map((item) => ({
            label:
              item.getAttribute('data-status-item') ??
              item.getAttribute('data-action-id') ??
              item.getAttribute('aria-label') ??
              (item.textContent ?? '').trim(),
            text: (item.textContent ?? '').trim(),
            whiteSpace: getComputedStyle(item).whiteSpace,
            top: item.getBoundingClientRect().top,
            bottom: item.getBoundingClientRect().bottom,
          })),
        };
      });

      expect(measured.items.length).toBe(row.items[width]);
      // The row never overflows its own box — the shape
      // `targeted-parity.test.ts:1740` established for the status row at 1280.
      expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth);
      expect(measured.flexWrap).toBe('nowrap');

      /*
       * One line, geometrically: if any item began below the shallowest item's
       * bottom edge, the row would have wrapped. This is the assertion that
       * would catch a second line even where `white-space` is irrelevant,
       * because a flex row wraps whole items, not text.
       */
      const lowestTop = Math.max(...measured.items.map((item) => item.top));
      const shallowestBottom = Math.min(
        ...measured.items.map((item) => item.bottom),
      );
      expect(lowestTop).toBeLessThan(shallowestBottom);

      /*
       * And no *label* wraps. A single-glyph control — the tab strip's `+`, the
       * close `×`, an icon-only trigger — has no break opportunity to suppress
       * and is legitimately `white-space: normal`, so the rule is applied to
       * every item whose label is longer than one character. At 375 the menu
       * row is a single icon-only trigger, so that set is legitimately empty
       * there and the item count above is what keeps the case honest.
       */
      const wrappable = measured.items.filter((item) => item.text.length > 1);
      expect(
        wrappable
          .filter((item) => item.whiteSpace !== 'nowrap')
          .map((item) => `${item.label}: ${item.whiteSpace}`),
      ).toEqual([]);

      await expectNoHorizontalPageScroll(page, width);
    });
  }

  test(`T084 ${width}px keeps every status item unwrapped in the binding drop order`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await page.goto('/');
    const status = page.getByRole('status', {
      name: 'Document status',
      exact: true,
    });
    await expect(status).toBeVisible();

    const measured = await status.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      items: Array.from(
        element.querySelectorAll<HTMLElement>('[data-status-item]'),
      )
        .filter((item) => {
          const rect = item.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((item) => ({
          id: item.getAttribute('data-status-item') ?? '',
          whiteSpace: getComputedStyle(item).whiteSpace,
        })),
    }));

    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth);
    expect(
      measured.items.filter((item) => item.whiteSpace !== 'nowrap'),
    ).toEqual([]);
    /*
     * The binding drops status items in its own order at the minimum window:
     * `mockup.html:82-83` hides the provider, autosave, encoding, line-ending
     * and count there, leaving the standard and the caret position. Above that
     * width the full row is drawn. Asserting the whole ordered list is what
     * makes "the row does not wrap" mean "it shed items instead of wrapping".
     */
    expect(measured.items.map((item) => item.id)).toEqual(
      width <= 376
        ? ['standard-kind', 'cursor']
        : [
            'standard-kind',
            'cursor',
            'count',
            'encoding',
            'line-ending',
            'autosave',
          ],
    );
  });
}

/* ------------------------------------------------------------------ *
 * Gap 6 — prompts at 768.
 * ------------------------------------------------------------------ */

// Proves: FR-FT-046 (partial — "no clipping" as well as containment, for the close prompt and its three buttons, at 768 only)
test('T084 768px keeps the close prompt reachable, contained and answerable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: VIEWPORT_HEIGHT });
  await page.goto('/?close-plan');

  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('dirty at 768');
  const tabItem = page.getByRole('tab').first().locator('..');
  await tabItem.getByRole('button', { name: /^Close /u }).click();

  const prompt = page.getByRole('dialog', {
    name: 'Save changes before closing?',
  });
  await expect(prompt).toBeVisible();
  await expectInsideViewport(prompt, 768, 'the prompt');
  /*
   * Reading order, which is Cancel first (`ClosePrompt.tsx:82-109`) so the
   * dismissing choice is the one focus lands on. The narrower width must not
   * reorder or drop any of the three.
   */
  await expect(prompt.getByRole('button')).toHaveText([
    'Cancel',
    'Discard',
    'Save',
  ]);
  for (const name of ['Save', 'Discard', 'Cancel']) {
    const button = prompt.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await expectInsideViewport(button, 768, `the ${name} button`);
  }
  await expectNoHorizontalPageScroll(page, 768);

  // Operable, not merely drawn: Cancel keeps the tab, Discard removes it.
  await prompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(1);

  await tabItem.getByRole('button', { name: /^Close /u }).click();
  await page
    .getByRole('dialog', { name: 'Save changes before closing?' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page.getByRole('tab')).toHaveCount(0);
});

// Proves: FR-FT-046 (partial — "no clipping" as well as containment, for the external-change prompt and its three buttons, at 768 only)
test('T084 768px keeps the external-change prompt reachable, contained and answerable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: VIEWPORT_HEIGHT });
  await page.goto('/?ft-vs-04');

  await page.getByRole('button', { name: 'New tab' }).click();
  await page.getByRole('tab').nth(1).click();

  const prompt = page.getByRole('dialog', { name: 'File changed on disk' });
  await expect(prompt).toBeVisible();
  await expectInsideViewport(prompt, 768, 'the prompt');
  await expect(prompt.getByRole('button')).toHaveText([
    'Reload from disk',
    'Keep mine',
    'Skip',
  ]);
  for (const name of ['Reload from disk', 'Keep mine', 'Skip']) {
    const button = prompt.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await expectInsideViewport(button, 768, `the ${name} button`);
  }
  // The two sides of the comparison both survive the narrower width.
  await expect(
    prompt.getByRole('heading', { name: /^On disk ·/u }),
  ).toBeVisible();
  await expect(
    prompt.getByRole('heading', { name: /^Yours ·/u }),
  ).toBeVisible();
  await expectNoHorizontalPageScroll(page, 768);

  await prompt.getByRole('button', { name: 'Skip' }).click();
  await expect(prompt).toHaveCount(0);
});

// Proves: FR-FT-046 (partial — "no clipping" as well as containment, for the normalization prompt and its two buttons, at 768 only)
test('T084 768px keeps the normalization prompt reachable, contained and answerable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: VIEWPORT_HEIGHT });
  /*
   * The mock backend issues a `normalizationToken` only for the
   * `prompt-normalization` fixture (`dev/bridge-mock/go/appmodel/
   * AppModelHandler.ts:1180-1185`), so that is the only route to this prompt.
   * The fixture also re-lays the *close* prompt out to the binding's picture
   * (`position: absolute`, no max-height), which is why nothing here measures
   * the close prompt on this route — only the normalization dialog, which keeps
   * its production layout.
   */
  await page.goto(
    '/?close-plan&parity-case=state:prompt-normalization:minimal-light',
  );
  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('crlf document at 768');
  const tabItem = page.getByRole('tab').first().locator('..');
  await tabItem.getByRole('button', { name: /^Close /u }).click();
  await page
    .getByRole('dialog', { name: 'Save changes before closing?' })
    .getByRole('button', { name: 'Save' })
    .click();

  const prompt = page.getByRole('dialog', { name: 'Normalize line endings?' });
  await expect(prompt).toBeVisible();
  await expectInsideViewport(prompt, 768, 'the prompt');
  await expect(prompt.getByRole('button')).toHaveText([
    'Normalize and save',
    'Cancel',
  ]);
  for (const name of ['Normalize and save', 'Cancel']) {
    const button = prompt.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await expectInsideViewport(button, 768, `the ${name} button`);
  }
  await expectNoHorizontalPageScroll(page, 768);

  await prompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(prompt).toHaveCount(0);
});

/* ------------------------------------------------------------------ *
 * Gap 7 — the launcher at 768.
 * ------------------------------------------------------------------ */

// Proves: FR-FT-046 (partial — "no clipping" as well as containment, for the launcher, its three actions and a recent entry, at 768 only)
test('T084 768px renders, contains and operates the real launcher', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: VIEWPORT_HEIGHT });
  await page.goto('/?ft-vs-07');

  await page
    .getByRole('tab')
    .first()
    .locator('..')
    .getByRole('button', { name: /^Close /u })
    .click();

  const launcher = page.getByTestId('document-launcher');
  await expect(launcher).toBeVisible();
  await expectInsideViewport(launcher, 768, 'the document launcher');
  const overflow = await launcher.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  await expectNoHorizontalPageScroll(page, 768);

  /*
   * `Open Folder` is unavailable because the registry says so
   * (`logic/actions/actionRegistry.ts`, `open-folder` deferred), not because
   * this width hid it — the availability answer must not change with the
   * viewport.
   */
  await expect(
    launcher.getByRole('button', { name: 'New File' }),
  ).toBeEnabled();
  await expect(
    launcher.getByRole('button', { name: 'Open File' }),
  ).toBeEnabled();
  await expect(
    launcher.getByRole('button', { name: 'Open Folder' }),
  ).toBeDisabled();
  await expect(launcher.getByRole('listitem')).toHaveCount(6);

  for (const name of ['New File', 'Open File', 'Open Folder']) {
    await expectInsideViewport(
      launcher.getByRole('button', { name, exact: true }),
      768,
      `the launcher ${name} button`,
    );
  }

  // A recent entry still opens from here at this width.
  const recent = launcher.getByRole('button', { name: 't032-recent-07.md' });
  await expectInsideViewport(recent, 768, 'the recent entry');
  await recent.click();
  await expect(
    page.getByRole('tab', { name: 't032-recent-07.md' }),
  ).toBeVisible();
  await expect(launcher).toHaveCount(0);
});

/* ------------------------------------------------------------------ *
 * Gap 8 — the preview at 768 and 375.
 * ------------------------------------------------------------------ */

for (const width of [768, 375] as const) {
  test(`T084 ${width}px switches to Preview through the View menu and fills the region`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await page.goto('/');

    const toolbar = page.getByRole('toolbar', { name: 'Document toolbar' });
    const inlineSwitch = toolbar.getByRole('radiogroup', {
      name: 'View arrangement',
    });
    if (width <= 376) {
      // The minimum window has no inline switch at all, so the View menu is not
      // a convenience here — it is the route.
      await expect(inlineSwitch).toBeHidden();
    } else {
      await expect(inlineSwitch).toBeVisible();
    }

    const view = await openViewMenu(page, width);
    await expect(
      view.getByRole('menuitemradio', { name: 'Split', exact: true }),
    ).toHaveAttribute('data-state', 'checked');
    await view
      .getByRole('menuitemradio', { name: 'Preview', exact: true })
      .click();

    const preview = page.getByRole('region', { name: 'Preview pane' });
    await expect(preview).toBeVisible();
    // Preview mode is one pane: the editor is out of the accessibility tree.
    await expect(page.getByRole('region', { name: 'Editor pane' })).toHaveCount(
      0,
    );
    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();
    // The viewer fills the region rather than sharing it — a split would leave
    // it near half the viewport.
    expect(previewBox!.width).toBeGreaterThan(width * 0.8);
    expect(previewBox!.x).toBeGreaterThanOrEqual(0);
    expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(width);
    await expectNoHorizontalPageScroll(page, width);

    // And the View menu takes it back: the arrangement is a real round trip at
    // this width, not a one-way door.
    const reopened = await openViewMenu(page, width);
    await expect(
      reopened.getByRole('menuitemradio', { name: 'Preview', exact: true }),
    ).toHaveAttribute('data-state', 'checked');
    await reopened
      .getByRole('menuitemradio', { name: 'Editor', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Editor pane' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Preview pane' }),
    ).toHaveCount(0);
  });

  // Proves: FR-FT-046 (partial — "no clipping" as well as containment, for the paused-preview bar and its refresh/retry controls, at 768 and 375)
  test(`T084 ${width}px keeps the paused preview refresh control reachable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    /*
     * A preview pauses above `PREVIEW_BYTE_LIMIT` (2 MiB,
     * `ui/widgets/PreviewPane.tsx:7`), and the mock backend only serves a
     * document that large for the `preview-*` fixtures. This one also makes the
     * refresh fail, so the retry path is observable rather than rendering two
     * megabytes of Markdown.
     */
    await page.goto('/?parity-case=state:preview-refresh-failed:minimal-light');
    await expect(page.getByRole('tab').first()).toBeVisible();

    const view = await openViewMenu(page, width);
    await view
      .getByRole('menuitemradio', { name: 'Preview', exact: true })
      .click();

    const pausedBar = page.locator('[data-preview-paused-bar="true"]');
    await expect(pausedBar).toBeVisible();
    await expectInsideViewport(pausedBar, width, 'the paused preview bar');
    await expect(page.locator('[data-preview-state="paused"]')).toBeVisible();

    const refresh = page.getByRole('button', { name: 'Refresh preview' });
    await expect(refresh).toBeEnabled();
    await expectInsideViewport(refresh, width, 'the Refresh preview control');
    // Reachable means nothing covers it: the point the pointer would land on
    // has to resolve to the control itself.
    expect(
      await refresh.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return hit !== null && element.contains(hit);
      }),
    ).toBe(true);

    await refresh.click();
    const retry = page.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await expectInsideViewport(retry, width, 'the retry control');
    await expect(page.locator('[data-error-code="io-failure"]')).toBeVisible();
    await expect(page.locator('[data-preview-state="paused"]')).toBeVisible();
    await expectNoHorizontalPageScroll(page, width);
  });
}
