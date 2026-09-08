# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend/e2e/core-editor.test.ts >> STORY-018-AC-3 matches the approved split-view reference
- Location: frontend/e2e/core-editor.test.ts:518:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  422 | 
  423 |   const monaco = page.locator('.monaco-editor');
  424 |   await expect(monaco).toBeVisible();
  425 |   await monaco.locator('textarea.inputarea').click({ force: true });
  426 |   const previewStartedAt = Date.now();
  427 |   await page.keyboard.type('# Hello');
  428 | 
  429 |   await Promise.all([
  430 |     expect(page.getByRole('heading', { level: 1, name: 'Hello' })).toBeVisible({
  431 |       timeout: acceptedPreviewCIToleranceMs,
  432 |     }),
  433 |     expect(page.getByLabel('Document status', { exact: true })).toContainText(
  434 |       '2 words',
  435 |       { timeout: acceptedPreviewCIToleranceMs },
  436 |     ),
  437 |   ]);
  438 |   expect(Date.now() - previewStartedAt).toBeLessThanOrEqual(
  439 |     acceptedPreviewCIToleranceMs,
  440 |   );
  441 | 
  442 |   await expect
  443 |     .poll(
  444 |       () =>
  445 |         page.evaluate((): boolean => {
  446 |           const mirrorWindow = window as Window & {
  447 |             readonly __GME_STATE_PATCHES__?: readonly unknown[];
  448 |           };
  449 |           const patches = mirrorWindow.__GME_STATE_PATCHES__ ?? [];
  450 | 
  451 |           return patches.some((patch: unknown): boolean => {
  452 |             if (typeof patch !== 'object' || patch === null) {
  453 |               return false;
  454 |             }
  455 |             const documents = (patch as Record<string, unknown>).documents;
  456 |             if (typeof documents !== 'object' || documents === null) {
  457 |               return false;
  458 |             }
  459 |             const upsert = (documents as Record<string, unknown>).upsert;
  460 |             if (typeof upsert !== 'object' || upsert === null) {
  461 |               return false;
  462 |             }
  463 |             const document = (upsert as Record<string, unknown>)[
  464 |               'mock-document'
  465 |             ];
  466 | 
  467 |             return (
  468 |               typeof document === 'object' &&
  469 |               document !== null &&
  470 |               (document as Record<string, unknown>).dirty === true &&
  471 |               (document as Record<string, unknown>).wordCount === 2
  472 |             );
  473 |           });
  474 |         }),
  475 |       { timeout: acceptedPreviewCIToleranceMs },
  476 |     )
  477 |     .toBe(true);
  478 | 
  479 |   const patchMirrorProof = await page.evaluate(
  480 |     (): {
  481 |       allPatchesFrozen: boolean;
  482 |       contentFree: boolean;
  483 |       mirrorFrozen: boolean;
  484 |     } => {
  485 |       const mirrorWindow = window as Window & {
  486 |         readonly __GME_STATE_PATCHES__?: readonly unknown[];
  487 |       };
  488 |       const patches = mirrorWindow.__GME_STATE_PATCHES__ ?? [];
  489 | 
  490 |       function hasContentKey(value: unknown): boolean {
  491 |         if (Array.isArray(value)) {
  492 |           return value.some(hasContentKey);
  493 |         }
  494 |         if (typeof value !== 'object' || value === null) {
  495 |           return false;
  496 |         }
  497 | 
  498 |         return Object.entries(value).some(
  499 |           ([key, child]): boolean => key === 'content' || hasContentKey(child),
  500 |         );
  501 |       }
  502 | 
  503 |       return {
  504 |         allPatchesFrozen: patches.every(Object.isFrozen),
  505 |         contentFree: !hasContentKey(patches),
  506 |         mirrorFrozen: Object.isFrozen(patches),
  507 |       };
  508 |     },
  509 |   );
  510 |   expect(patchMirrorProof).toEqual({
  511 |     allPatchesFrozen: true,
  512 |     contentFree: true,
  513 |     mirrorFrozen: true,
  514 |   });
  515 | });
  516 | 
  517 | // Proves: STORY-018-AC-3
  518 | test('STORY-018-AC-3 matches the approved split-view reference', async ({
  519 |   page,
  520 | }) => {
  521 |   await page.setViewportSize({ width: 1280, height: viewportHeight });
> 522 |   await page.goto('/');
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  523 | 
  524 |   await expect(
  525 |     page.getByRole('complementary', { name: 'Workspace' }),
  526 |   ).toBeAttached();
  527 |   await expect(page.getByRole('main', { name: 'Document area' })).toBeVisible();
  528 |   await expect(page.getByLabel('Editor view', { exact: true })).toBeVisible();
  529 |   await expect(
  530 |     page.getByLabel('Document toolbar', { exact: true }),
  531 |   ).toBeVisible();
  532 | 
  533 |   const viewArrangement = page.getByRole('radiogroup', {
  534 |     name: 'View arrangement',
  535 |   });
  536 |   await expect(viewArrangement.getByRole('radio')).toHaveCount(3);
  537 |   await expect(
  538 |     viewArrangement.getByRole('radio', { name: 'Split' }),
  539 |   ).toBeChecked();
  540 | 
  541 |   const editorPane = page.getByLabel('Editor pane', { exact: true });
  542 |   await expect(editorPane).toContainText('Editor · Untitled');
  543 |   await expect(editorPane).toContainText('UTF-8 · LF');
  544 | 
  545 |   const previewPane = page.getByLabel('Preview pane', { exact: true });
  546 |   await expect(previewPane).toContainText('● Preview · live');
  547 |   await expect(previewPane).toContainText('GFM');
  548 |   await expect(
  549 |     page.getByLabel('Document status', { exact: true }),
  550 |   ).toContainText('Split');
  551 |   await expectCollapsedAssistant(page);
  552 | 
  553 |   const [
  554 |     explorerBounds,
  555 |     documentBounds,
  556 |     toolbarBounds,
  557 |     editorBounds,
  558 |     previewBounds,
  559 |     statusBounds,
  560 |     dividerBounds,
  561 |   ] = await Promise.all([
  562 |     page.getByRole('complementary', { name: 'Workspace' }).boundingBox(),
  563 |     page.getByRole('main', { name: 'Document area' }).boundingBox(),
  564 |     page.getByLabel('Document toolbar', { exact: true }).boundingBox(),
  565 |     editorPane.boundingBox(),
  566 |     previewPane.boundingBox(),
  567 |     page.getByLabel('Document status', { exact: true }).boundingBox(),
  568 |     page.getByRole('separator', { name: 'Resize workspace' }).boundingBox(),
  569 |   ]);
  570 | 
  571 |   expect(explorerBounds).not.toBeNull();
  572 |   expect(documentBounds).not.toBeNull();
  573 |   expect(toolbarBounds).not.toBeNull();
  574 |   expect(editorBounds).not.toBeNull();
  575 |   expect(previewBounds).not.toBeNull();
  576 |   expect(statusBounds).not.toBeNull();
  577 |   expect(dividerBounds).not.toBeNull();
  578 |   if (
  579 |     explorerBounds === null ||
  580 |     documentBounds === null ||
  581 |     toolbarBounds === null ||
  582 |     editorBounds === null ||
  583 |     previewBounds === null ||
  584 |     statusBounds === null ||
  585 |     dividerBounds === null
  586 |   ) {
  587 |     throw new Error('Core editor layout bounds are unavailable');
  588 |   }
  589 |   expect(documentBounds.x).toBe(dividerBounds.x + dividerBounds.width);
  590 |   expect(documentBounds.y + documentBounds.height).toBe(viewportHeight);
  591 |   expect(editorBounds.y).toBeGreaterThanOrEqual(
  592 |     toolbarBounds.y + toolbarBounds.height,
  593 |   );
  594 |   expect(editorBounds.width).toBeCloseTo(previewBounds.width, 0);
  595 |   expect(statusBounds.y + statusBounds.height).toBe(viewportHeight);
  596 | 
  597 |   await expect(page).toHaveScreenshot('core-editor-split-1280.png', {
  598 |     fullPage: false,
  599 |   });
  600 | });
  601 | 
  602 | // Proves: STORY-032-AC-3
  603 | // This deterministic candidate is presented for product-owner review; the test never approves it.
  604 | test('STORY-032-AC-3 presents deterministic 1280x720 candidate for owner approval', async ({
  605 |   page,
  606 | }) => {
  607 |   await page.setViewportSize({ width: 1280, height: viewportHeight });
  608 |   await page.goto('/');
  609 | 
  610 |   await expect(page.getByRole('main', { name: 'Document area' })).toBeVisible();
  611 |   await expect(page.getByLabel('Editor pane', { exact: true })).toBeVisible();
  612 |   await expect(page.getByLabel('Preview pane', { exact: true })).toBeVisible();
  613 |   await expect(
  614 |     page.getByLabel('Document status', { exact: true }),
  615 |   ).toContainText('Split');
  616 |   await page.screenshot({
  617 |     path: 'test-results/phase01-owner-candidate-1280x720.png',
  618 |     fullPage: false,
  619 |   });
  620 | });
  621 | 
  622 | // Proves: STORY-018-AC-4
```