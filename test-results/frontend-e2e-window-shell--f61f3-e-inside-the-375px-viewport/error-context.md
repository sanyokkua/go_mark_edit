# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend/e2e/window-shell.test.ts >> T040 Settings popup stays operable inside the 375px viewport
- Location: frontend/e2e/window-shell.test.ts:385:3

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  289 |         .poll(() =>
  290 |           page.evaluate(
  291 |             () => document.documentElement.scrollWidth <= window.innerWidth,
  292 |           ),
  293 |         )
  294 |         .toBe(true);
  295 | 
  296 |       const toolbar = page.getByLabel('Document toolbar');
  297 |       if (width === 375) {
  298 |         await expect(
  299 |           page.getByRole('button', { name: 'More actions' }),
  300 |         ).toBeVisible();
  301 |         const editor = await page.getByLabel('Editor pane').boundingBox();
  302 |         const preview = await page.getByLabel('Preview pane').boundingBox();
  303 |         const document = page.getByRole('main', { name: 'Document area' });
  304 |         const documentBounds = await document.boundingBox();
  305 |         const toolbarBounds = await toolbar.boundingBox();
  306 |         const toolbarViewBounds = await toolbar
  307 |           .getByRole('button', { name: 'View', exact: true })
  308 |           .boundingBox();
  309 |         const arrangementBounds = await toolbar
  310 |           .getByRole('radiogroup', { name: 'View arrangement' })
  311 |           .boundingBox();
  312 |         expect(editor).not.toBeNull();
  313 |         expect(preview).not.toBeNull();
  314 |         expect(documentBounds).not.toBeNull();
  315 |         expect(toolbarBounds).not.toBeNull();
  316 |         expect(toolbarViewBounds).not.toBeNull();
  317 |         expect(arrangementBounds).not.toBeNull();
  318 |         await expect(document).toBeInViewport({ ratio: 1 });
  319 |         await expect(toolbar).toBeInViewport({ ratio: 1 });
  320 |         expect(documentBounds!.x).toBeGreaterThanOrEqual(0);
  321 |         expect(documentBounds!.x + documentBounds!.width).toBeLessThanOrEqual(
  322 |           375,
  323 |         );
  324 |         expect(toolbarBounds!.x).toBeGreaterThanOrEqual(documentBounds!.x);
  325 |         expect(toolbarBounds!.x + toolbarBounds!.width).toBeLessThanOrEqual(
  326 |           documentBounds!.x + documentBounds!.width,
  327 |         );
  328 |         expect(toolbarViewBounds!.x).toBeGreaterThanOrEqual(toolbarBounds!.x);
  329 |         expect(
  330 |           toolbarViewBounds!.x + toolbarViewBounds!.width,
  331 |         ).toBeLessThanOrEqual(toolbarBounds!.x + toolbarBounds!.width);
  332 |         expect(arrangementBounds!.x).toBeGreaterThanOrEqual(toolbarBounds!.x);
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
> 389 |     await page.goto('/');
      |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
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
  433 |       await page.goto('/');
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
```