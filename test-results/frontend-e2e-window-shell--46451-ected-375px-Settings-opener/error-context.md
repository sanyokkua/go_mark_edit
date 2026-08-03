# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend/e2e/window-shell.test.ts >> T041 Close control restores the connected 375px Settings opener
- Location: frontend/e2e/window-shell.test.ts:429:5

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  333 |         expect(
  334 |           arrangementBounds!.x + arrangementBounds!.width,
  335 |         ).toBeLessThanOrEqual(toolbarBounds!.x + toolbarBounds!.width);
  336 |         expect(preview!.y).toBeGreaterThan(editor!.y);
  337 |         expect(Math.abs(preview!.x - editor!.x)).toBeLessThanOrEqual(1);
  338 |       } else {
  339 |         await expect(
  340 |           page.getByRole('button', { name: 'More actions' }),
  341 |         ).toHaveCount(0);
  342 |       }
  343 | 
  344 |       await expect
  345 |         .poll(() =>
  346 |           toolbar.evaluate(
  347 |             (element) => element.scrollWidth <= element.clientWidth,
  348 |           ),
  349 |         )
  350 |         .toBe(true);
  351 |       await expectMonacoThemeReady(page, mode, editorBackground);
  352 |       await page.addStyleTag({
  353 |         content:
  354 |           '.monaco-editor .cursor, .monaco-editor .decorationsOverviewRuler { visibility: hidden !important; }',
  355 |       });
  356 |       await expect(page).toHaveScreenshot(
  357 |         `window-shell-${width}-${theme}-${mode}.png`,
  358 |         {
  359 |           animations: 'disabled',
  360 |           caret: 'hide',
  361 |         },
  362 |       );
  363 |       expect(runtimeErrors).toEqual([]);
  364 |     });
  365 |   }
  366 | }
  367 | 
  368 | test('T039 native minimum frame rounding keeps the workspace off-canvas', async ({
  369 |   page,
  370 | }) => {
  371 |   await page.setViewportSize({ width: 376, height: 480 });
  372 |   await page.goto('/');
  373 | 
  374 |   const workspace = page.getByRole('complementary', { name: 'Workspace' });
  375 |   await expect(workspace).toBeVisible();
  376 |   await expect
  377 |     .poll(async () => Math.round((await workspace.boundingBox())?.width ?? -1))
  378 |     .toBe(230);
  379 |   await expect(
  380 |     page.getByRole('button', { name: 'More actions' }),
  381 |   ).toBeVisible();
  382 | });
  383 | 
  384 | for (const width of widths) {
  385 |   test(`T040 Settings popup stays operable inside the ${width}px viewport`, async ({
  386 |     page,
  387 |   }) => {
  388 |     await page.setViewportSize({ width, height: 480 });
  389 |     await page.goto('/');
  390 | 
  391 |     await openAction(page, 'Settings');
  392 |     const popup = page.getByRole('menu', { name: 'Settings menu' });
  393 |     await expect(popup).toBeVisible();
  394 |     const popupBounds = await popup.boundingBox();
  395 |     expect(popupBounds).not.toBeNull();
  396 |     expect(popupBounds!.x).toBeGreaterThanOrEqual(0);
  397 |     expect(popupBounds!.x + popupBounds!.width).toBeLessThanOrEqual(width);
  398 |     expect(popupBounds!.y).toBeGreaterThanOrEqual(0);
  399 |     expect(popupBounds!.y + popupBounds!.height).toBeLessThanOrEqual(480);
  400 |     await expect
  401 |       .poll(() =>
  402 |         popup.evaluate((element) => element.parentElement === document.body),
  403 |       )
  404 |       .toBe(true);
  405 |     await expect
  406 |       .poll(() =>
  407 |         page.evaluate(
  408 |           () => document.documentElement.scrollWidth <= window.innerWidth,
  409 |         ),
  410 |       )
  411 |       .toBe(true);
  412 | 
  413 |     const glass = popup.getByRole('radio', { name: 'Liquid Glass' });
  414 |     await glass.click();
  415 |     await expect(glass).toBeChecked();
  416 |     const dark = popup.getByRole('radio', { name: 'Dark' });
  417 |     await dark.focus();
  418 |     await dark.press('Space');
  419 |     await expect(dark).toBeChecked();
  420 |     const appearance = popup.getByRole('menuitem', { name: 'Appearance' });
  421 |     await appearance.focus();
  422 |     await appearance.press('Enter');
  423 |     await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  424 |   });
  425 | }
  426 | 
  427 | for (const width of [375, 1280] as const) {
  428 |   for (const closeMethod of ['Close control', 'Escape'] as const) {
  429 |     test(`T041 ${closeMethod} restores the connected ${width}px Settings opener`, async ({
  430 |       page,
  431 |     }) => {
  432 |       await page.setViewportSize({ width, height: 720 });
> 433 |       await page.goto('/');
      |                  ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  434 | 
  435 |       const actionBar = page.getByRole('navigation', {
  436 |         name: 'Application actions',
  437 |       });
  438 |       const opener =
  439 |         width === 375
  440 |           ? actionBar.getByRole('button', { name: 'More actions' })
  441 |           : actionBar.getByRole('button', { name: 'Settings', exact: true });
  442 |       await openSettings(page);
  443 |       const dialog = page.getByRole('dialog', { name: 'Settings' });
  444 |       if (closeMethod === 'Escape') {
  445 |         await page.keyboard.press('Escape');
  446 |       } else {
  447 |         await dialog.getByRole('button', { name: 'Close' }).click();
  448 |       }
  449 | 
  450 |       await expect(dialog).toHaveCount(0);
  451 |       await expect
  452 |         .poll(() => opener.evaluate((element) => element.isConnected))
  453 |         .toBe(true);
  454 |       await expect(opener).toBeFocused();
  455 |     });
  456 |   }
  457 | }
  458 | 
  459 | test('T026 shell actions, focus, reset, sidebar, notification, identity, and absence', async ({
  460 |   page,
  461 | }) => {
  462 |   await page.setViewportSize({ width: 1280, height: 720 });
  463 |   await page.goto('/');
  464 | 
  465 |   await openSettings(page);
  466 |   const settings = page.getByRole('dialog', { name: 'Settings' });
  467 |   await expect(settings).toBeFocused();
  468 |   await page.getByRole('radio', { name: 'Minimal' }).click();
  469 |   await page.getByRole('radio', { name: 'Dark' }).click();
  470 |   await page.getByRole('button', { name: 'Reset appearance' }).click();
  471 |   await expect(page.getByRole('radio', { name: 'Material' })).toBeChecked();
  472 |   await expect(
  473 |     page.getByRole('radio', { name: 'Follows system' }),
  474 |   ).toBeChecked();
  475 |   await page.keyboard.press('Escape');
  476 |   await expect(settings).toHaveCount(0);
  477 |   await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
  478 | 
  479 |   await openAction(page, 'View');
  480 |   const workspaceToggle = page.getByRole('menuitemcheckbox', {
  481 |     name: 'Show Workspace',
  482 |   });
  483 |   await workspaceToggle.click();
  484 |   await expect(
  485 |     page.getByRole('complementary', { name: 'Workspace' }),
  486 |   ).toBeHidden();
  487 |   await openAction(page, 'View');
  488 |   await page.getByRole('menuitemcheckbox', { name: 'Show Workspace' }).click();
  489 |   await expect(
  490 |     page.getByRole('complementary', { name: 'Workspace' }),
  491 |   ).toBeVisible();
  492 | 
  493 |   await openAction(page, 'About');
  494 |   const about = page.getByRole('dialog', { name: 'About GoMarkEdit' });
  495 |   await expect(about).toBeFocused();
  496 |   await expect(about.getByText('Version dev', { exact: true })).toBeVisible();
  497 |   await page.keyboard.press('Escape');
  498 | 
  499 |   await page.goto('/?rejectAppearance=1');
  500 |   await openSettings(page);
  501 |   await page.getByRole('radio', { name: 'Liquid Glass' }).click();
  502 |   const errorToast = page.locator('[data-severity="error"]');
  503 |   await expect(errorToast).toContainText('Invalid input');
  504 |   await expect(errorToast).toContainText('A value needs to be corrected.');
  505 |   await expect(page.getByText(/private|https?:\/\//i)).toHaveCount(0);
  506 |   await expectFutureSurfacesAbsent(page);
  507 |   await errorToast.getByRole('button', { name: 'Dismiss' }).click();
  508 |   await expect(errorToast).toHaveCount(0);
  509 | });
  510 | 
  511 | test('T029 keeps a long localized shell label and its two-layer keyboard focus ring visible', async ({
  512 |   page,
  513 | }) => {
  514 |   await page.setViewportSize({ width: 768, height: 720 });
  515 |   await page.goto('/');
  516 | 
  517 |   const actionBar = page.getByRole('navigation', {
  518 |     name: 'Application actions',
  519 |   });
  520 |   const settings = actionBar.getByRole('button').first();
  521 |   await expect(settings).toHaveAccessibleName('Settings');
  522 |   await settings.focus();
  523 |   await settings.evaluate((button) => {
  524 |     button.textContent =
  525 |       'Einstellungen und Arbeitsbereichsoptionen fuer die Dokumentbearbeitung';
  526 |   });
  527 |   await expect(settings).toBeFocused();
  528 |   await expect(settings).toHaveAccessibleName(
  529 |     'Einstellungen und Arbeitsbereichsoptionen fuer die Dokumentbearbeitung',
  530 |   );
  531 |   expect(
  532 |     await settings.evaluate(
  533 |       (button) => button.scrollWidth <= button.clientWidth,
```