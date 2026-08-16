import { expect, test } from '@playwright/test';

import { expectPainted } from './painted';

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

// Proves: FR-FT-008 (partial — flush then save then one confirmation; "never reads the visible editor widget" is unproven; T157)
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

// Proves: FR-FT-034 (partial — the strip, menu Move, edge disable and announcement; the middle-click clause is proved by 'T141 middle-click closes the targeted tab' below)
// Proves: FR-FT-046 (partial — only the "no clipping" clause, only for the Tab actions menu, only at 1280; the 768 and 375 widths, the other in-scope actions and the divider are proven elsewhere)
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
  /*
   * T126. This menu carries the highest structural clipping risk in the
   * application: it is the only `data-viewport-popup` widget rendered without
   * `createPortal` (`TabContextMenu.tsx`), so it stays inside the tab strip's
   * subtree and is `position: absolute` against `.shell`, which is
   * `overflow: hidden`. Every assertion here was `toBeEnabled`/`toBeDisabled`,
   * which read the accessibility tree and never layout. Proven load-bearing:
   * clip `.shell` and the two availability assertions below stay green while
   * this one reports "laid out at (1143, 204) but the topmost paint there is
   * div".
   */
  await expectPainted(menu, 'the Tab actions menu');
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

// Proves: FR-FT-037 (the Reveal failure remediation pair, both controls painted
// and each running its own command). The detached `not-found` pair is not
// proven here — its `Save to recreate` has no command yet (T151).
test('FR-FT-037 offers both actionable Reveal remediations, paints them, and runs each', async ({
  page,
}) => {
  /*
   * T116. The fixed remediation vocabulary was unreachable in the running
   * application: `Toast.tsx` rendered the control only when a caller passed
   * `onRemediate`, and the one production render site did not — so `Retry`,
   * `Copy path` and the rest were built by `reportClassifiedError` and thrown
   * away. Every covering test supplied the missing half itself, which is why
   * nothing went red.
   *
   * `expectPainted` rather than `toBeVisible`: this is the first layout
   * assertion on any error toast in the suite, and T113 is the defect proving
   * `toBeVisible()` passes on an element an ancestor has clipped to nothing.
   * `toContainText` would be worse still — it never consults layout at all.
   */
  await page.goto('/?refuseReveal=1');

  // Path actions are correctly unavailable for an untitled document, and the
  // startup document is untitled. Save As is what adopts a path, so this is also
  // the shortest real journey to a document Reveal can be invoked on at all.
  await page.getByRole('button', { name: 'File' }).click();
  await page
    .getByRole('menu', { name: 'File' })
    // `Save As` not `Save As…`: the row carries aria-label="Save As", and an
    // accessible name from aria-label wins over the visible text's ellipsis.
    .getByRole('menuitem', { name: 'Save As', exact: true })
    .click();
  await expect(
    page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);

  await page.getByRole('tab').first().click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Tab actions' })
    .getByRole('menuitem', { name: 'Reveal in file manager' })
    .click();

  const errorToast = page.locator('[data-severity="error"]');
  await expect(errorToast).toHaveCount(1);
  await expect(errorToast).toHaveAttribute(
    'data-notification-code',
    'system-command-failure',
  );
  // The backend's own message survived, and no private path came with it.
  await expect(errorToast).toContainText(
    'The file manager could not reveal the document.',
  );
  await expect(page.getByText(/private|https?:\/\//iu)).toHaveCount(0);

  /*
   * T142: the contract's Reveal row is a *pair* — "Retry; a Reveal failure also
   * offers Copy path" — and the toast rendered one control, so whichever member
   * the mapping picked, the other was unreachable. Both must be present, in
   * contract order, and both must actually be painted: an assertion that only
   * queries the accessibility tree passes on a control clipped to zero area.
   */
  const retry = errorToast.getByRole('button', { name: 'Retry' });
  const remediate = errorToast.getByRole('button', { name: 'Copy path' });
  await expect(
    errorToast.getByRole('button').filter({ hasNotText: 'Dismiss' }),
  ).toHaveText(['Retry', 'Copy path']);
  await expect(retry).toBeEnabled();
  await expect(remediate).toBeEnabled();
  await expectPainted(retry, 'the Reveal failure Retry remediation');
  await expectPainted(remediate, 'the Reveal failure Copy path remediation');

  /*
   * Retry re-runs *Reveal*, not the other control's command. `?refuseReveal`
   * refuses every attempt, so a second refusal is the observable proof that the
   * button re-issued the reveal: the contract deduplicates it onto this same
   * notification with an incrementing count. A Retry wired to copy-path — which
   * is the only intent this caller could name before T142 — would have copied
   * the path and dismissed the toast instead.
   */
  await retry.click();
  await expect(errorToast).toContainText('×2');
  // The repeat must not have withdrawn either control it already earned.
  await expectPainted(remediate, 'the Copy path remediation after a Retry');

  await remediate.click();
  // FR-FT-037 wants the confirmation in a polite live region, and the resolved
  // failure must not keep sitting there — an error toast never expires on its own.
  await expect(
    page.getByRole('status').filter({ hasText: 'Copied path for' }),
  ).toHaveCount(1);
  await expect(errorToast).toHaveCount(0);
});

test('FR-FT-015 offers Retry on a refused Save and re-issues the write', async ({
  page,
}) => {
  /*
   * T117, and the half of T116's evidence that T116 could not produce on its own.
   *
   * `reportWriteError` dispatched `notifyError`, whose `localizedErrorCopy`
   * replaced the message Go built with generic catalogue copy, and never set a
   * remediation at all — so no failing write could ever show a control, however
   * well `Toast.tsx` was wired.
   *
   * `?refuseSave=1` refuses exactly one write. That count is what makes this
   * assertion worth making: an unconditional refusal could only prove the button
   * renders and does not throw, whereas a committed second write can only happen
   * if clicking Retry actually re-issued it.
   */
  await page.goto('/?refuseSave=1');

  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('a write the disk will refuse once');

  const file = page.getByRole('button', { name: 'File' });
  await file.click();
  await page
    .getByRole('menu', { name: 'File' })
    .getByRole('menuitem')
    .filter({ hasText: /^Save$/u })
    .click();

  const errorToast = page.locator('[data-severity="error"]');
  await expect(errorToast).toHaveCount(1);
  // Before T117: code 'io' and "The file operation could not be completed."
  await expect(errorToast).toContainText(
    'The disk reported a temporary failure',
  );
  await expect(page.getByText(/private|https?:\/\//iu)).toHaveCount(0);

  /*
   * `io-failure` is a one-member row — the contract remediates it with `Retry`
   * and nothing else — so the widened toast must render exactly one control
   * here. Asserting the whole set, not just that Retry exists, is what would
   * catch a mapping that started offering a member this category forbids.
   */
  const retry = errorToast.getByRole('button', { name: 'Retry' });
  await expect(
    errorToast.getByRole('button').filter({ hasNotText: 'Dismiss' }),
  ).toHaveText(['Retry']);
  await expect(retry).toBeEnabled();
  await expectPainted(retry, 'the refused Save Retry remediation');

  await retry.click();
  await expect(
    page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);
  await expect(errorToast).toHaveCount(0);
});

// Proves: FR-FT-046 (partial — only the "no clipping" clause, only for the external-change prompt, only at 1280)
test('FT-VS-04 shows the bounded external-change prompt and safe Skip decision', async ({
  page,
}) => {
  await page.goto('/?ft-vs-04');

  await page.getByRole('button', { name: 'New tab' }).click();
  const tabs = page.getByRole('tab');
  await tabs.nth(1).click();

  const prompt = page.getByRole('dialog', { name: 'File changed on disk' });
  await expect(prompt).toBeVisible();
  /*
   * T126. `ModalShell.tsx` portals only on the narrow parity route, so in the
   * ordinary application this prompt renders inline under the editor view and
   * inherits whatever that subtree clips. `toBeVisible()` cannot see that.
   * Proven load-bearing: clip `section.editorView` and the button-order and
   * heading assertions here stay green while this one reports "laid out at
   * (640, 360) but the topmost paint there is main".
   */
  await expectPainted(prompt, 'the external-change prompt');
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

// Proves: FR-FT-046 (partial — only the "no clipping" clause, only for the close prompt, only at 1280)
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
  // T126: same inline-render exposure as the external-change prompt above.
  await expectPainted(prompt, 'the close prompt');
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

/*
 * T141. The close affordance already routed through the shell's close funnel,
 * which is what raises this prompt; middle-click did not exist at all. Proving
 * the *prompt* rather than the tab count is deliberate — a middle-click wired
 * straight to the adapter would also make the tab disappear, and would do it by
 * discarding unsaved work without asking.
 */
// Proves: FR-FT-034 (partial — the middle-click clause only)
test('T141 middle-click closes the targeted tab through the same dirty-close prompt', async ({
  page,
}) => {
  await page.goto('/?close-plan');

  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await expect(editor).toBeVisible();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('dirty before the middle click');

  await page.getByRole('tab').first().click({ button: 'middle' });

  const prompt = page.getByRole('dialog', {
    name: 'Save changes before closing?',
  });
  await expectPainted(prompt, 'the close prompt raised by a middle-click');
  await expect(page.getByRole('tab')).toHaveCount(1);

  await prompt.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
});

/*
 * T145. The defect was that the markup's roles and the accessibility tree's
 * roles disagreed: every `role="tab"` sat inside a plain `<div>`, so no tab was
 * an owned child of the tablist. Asserting the markup would not have caught
 * that — the DOM was always the same shape — so this reads Chromium's own
 * accessibility tree over CDP, which is the tree assistive technology consumes.
 */
// Proves: FR-FT-047 (partial — the tab strip's role ownership and its
// tab-to-panel association only)
test('T145 exposes every tab as an owned child of the tablist controlling the editor panel', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New tab' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  const panelId = await page.getByRole('tabpanel').getAttribute('id');
  expect(panelId).not.toBeNull();
  const controls = await page
    .getByRole('tab')
    .evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute('aria-controls')),
    );
  expect(controls).toEqual([panelId, panelId]);

  const session = await page.context().newCDPSession(page);
  const tree = await session.send('Accessibility.getFullAXTree');
  await session.detach();

  const byId = new Map(tree.nodes.map((node) => [node.nodeId, node]));
  const tablist = tree.nodes.find((node) => node.role?.value === 'tablist');
  expect(tablist).toBeDefined();
  const childRoles = (tablist?.childIds ?? []).map(
    (childId) => byId.get(childId)?.role?.value,
  );
  expect(childRoles.filter((role) => role === 'tab')).toHaveLength(2);
});

/*
 * T153. The last step of FR-FT-037's focus chain is only reachable once the tab
 * strip has gone, and only `AppShell` can make that happen: closing the last
 * document unmounts `EditorView` and renders `Launcher` in its place. Driving
 * the real shell is therefore the point of doing this in the browser as well as
 * in jsdom — the unit harness reproduces the swap, this one is the swap.
 */
// Proves: FR-FT-037 (partial — the fourth step of the Reveal focus chain only)
test('T153 returns focus to the launcher New control when the last tab closes', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.getByRole('tab').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close Tab' }).click();

  const launcherNew = page.locator('[data-launcher-new="true"]');
  await expectPainted(launcherNew, 'the launcher New control');
  await expect(launcherNew).toBeFocused();
  await expect(page.getByRole('tab')).toHaveCount(0);
});

/*
 * T129. The bindings resolved and the actions existed; nothing dispatched
 * them, so both accelerators were dead keys. Pressing the real keys against
 * the real shell is the point — a unit test can call a handler that no key
 * reaches.
 */
// Proves: FR-FT-034 (partial — the Move tab accelerators and the edge no-op,
// end to end; the "no revision increment" half of the edge clause is proved in
// DocumentTabs.test.tsx, where the absence of a command is observable)
test('T129 reorders the active tab with the Move accelerators and no-ops at the edge', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New tab' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const order = (): Promise<(string | null)[]> =>
    page
      .getByRole('tab')
      .evaluateAll((tabs) =>
        tabs.map((tab) => tab.getAttribute('data-document-id')),
      );
  const before = await order();

  await page.keyboard.press('ControlOrMeta+Shift+PageUp');
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved' }),
  ).toContainText('position 1 of 2');
  expect(await order()).toEqual([before[1], before[0]]);
  await expect(page.getByRole('tab').nth(0)).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // The active tab now sits at the left-hand edge: the same key must succeed
  // and change nothing.
  await page.keyboard.press('ControlOrMeta+Shift+PageUp');
  await expect(page.locator('[data-notification-code]')).toHaveCount(0);
  expect(await order()).toEqual([before[1], before[0]]);

  await page.keyboard.press('ControlOrMeta+Shift+PageDown');
  await expect(
    page.getByRole('status').filter({ hasText: 'Moved' }),
  ).toContainText('position 2 of 2');
  expect(await order()).toEqual(before);
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
  const detailsRegion = page.getByRole('region', { name: 'Document details' });
  await expect(detailsRegion).toBeVisible();
  /*
   * This assertion is why T113 was invisible to the whole suite. `toBeVisible`
   * above passed for the entire time the panel was clipped to nothing by the
   * status row's `overflow: hidden` — it only requires a non-empty bounding box
   * and no `visibility: hidden`. The narrow width is exactly where the dropped
   * status items are supposed to stay reachable, so this is the case that most
   * needed to see paint rather than presence.
   */
  await expectPainted(detailsRegion, 'the Document details region at 375px');
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

// Proves: FR-FT-046 (partial — only the "no clipping" clause, only for the close prompt held open for a decision, only at 1280)
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
  /*
   * T126. A prompt that survives a stray click is worth nothing if it is not
   * on screen to answer. Proven load-bearing: clip `.application-frame` and
   * both `toBeVisible()` and the `toBeFocused()` below stay green while this
   * reports "laid out at (640, 360) but the topmost paint there is div#root".
   */
  await expectPainted(prompt, 'the close prompt held open for a decision');
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

/*
 * FR-FT-004 caps a window at 40 documents and requires the 41st distinct
 * insertion to be refused before any partial state change; the classified-error
 * table remediates `capacity-limit` "message-only, naming the limit".
 *
 * The cap itself is proven in Go by `TestOpenRefusesFortyFirstWithoutMutation`
 * (`internal/appmodel/open_lifecycle_test.go:102`), which asserts the refusal
 * carries `ClassifiedCapacityLimit`, leaves the document count and order
 * unchanged, and emits no patch. This case is not a second proof of that. Under
 * Playwright `vite.config.ts` substitutes the bridge mock for every
 * `wailsjs/go/*` import, so no browser run can reach the Go cap at all; what is
 * proven here is the half Go cannot prove — that the interface honours a
 * refusal instead of discarding it, which is what it did until now.
 *
 * The count is read straight from the DOM, which is why this succeeds where the
 * 2026-08-15 screen-automation attempt could not: the application surfaces no
 * document total anywhere on screen
 * (`evidence/ft-ev-09/sc-ft-002/boundaries-2026-08-15.md`).
 */
test('FT-VS-09 refuses the forty-first document and names the limit', async ({
  page,
}) => {
  await page.goto('/?parity-case=state:tab-40-document:minimal-light');

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(40);

  await page.getByRole('button', { name: 'New tab' }).click();

  const refusal = page.locator('[data-notification-code="capacity-limit"]');
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toContainText('40 documents');
  await expect(tabs).toHaveCount(40);
});

/*
 * FR-FT-005: a file larger than 50 MiB MUST be refused before partial model
 * insertion "with a message naming the 50 MiB limit". The 2026-08-15
 * walkthrough confirmed the refusal on the real binary but saw no message
 * across both a 4-second and a 25-second observation window, and recorded it as
 * an observation rather than a defect. It was a defect: the backend writes the
 * message (`internal/file/document_reader.go:211`) and every entry handler in
 * `App.tsx` read only its success field, so the refusal reached the user as
 * silence.
 */
test('FT-VS-09 refuses an over-50-MiB file and names the limit', async ({
  page,
}) => {
  await page.goto('/?ft-vs-09');

  /*
   * Asserted rather than sampled: `count()` on a freshly navigated page can
   * read 0 before the projection hydrates, which would make the
   * "no tab was added" check below pass against the wrong baseline.
   */
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(1);

  await page.getByRole('button', { name: 'File' }).click();
  await page
    .getByRole('menu', { name: 'File' })
    .getByRole('menuitem', { name: 'boundary-50mib-plus-one.md' })
    .click();

  const refusal = page.locator('[data-notification-code="capacity-limit"]');
  await expect(refusal).toHaveCount(1);
  await expect(refusal).toContainText('50 MiB');
  await expect(tabs).toHaveCount(1);
});

/*
 * T110: the File menu advertises an accelerator beside New File, Open File,
 * Save, Save As and Close Tab, and no handler dispatched any of them. The
 * unit suite proves ShellMenuRow hands the file actions to the keydown hook;
 * this proves the keystroke reaches the running interface and changes it.
 *
 * The explicit Save leg is also T104's second symptom re-examined. A
 * `save-success` notification is only ever emitted by the explicit write path,
 * so asserting it discriminates a real explicit save from the autosave that
 * would leave an `Autosaved` label behind on its own.
 */
test('FT-VS-10 dispatches the File accelerators the menu advertises', async ({
  page,
}) => {
  await page.goto('/');

  const editor = page.getByRole('textbox', { name: 'Editor content' });
  await expect(editor).toBeVisible();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.type('saved by the advertised accelerator');

  await page.keyboard.press('ControlOrMeta+s');
  await expect(
    page.locator('[data-notification-code="save-success"]'),
  ).toHaveCount(1);
  await expect(
    page
      .locator('header[aria-label="Document identity"]')
      .filter({ hasText: 'Saved' }),
  ).toHaveCount(1);

  const openedTabs = await page.getByRole('tab').count();

  await page.keyboard.press('ControlOrMeta+n');
  await expect(page.getByRole('tab')).toHaveCount(openedTabs + 1);

  await page.keyboard.press('ControlOrMeta+w');
  await expect(page.getByRole('tab')).toHaveCount(openedTabs);
});
