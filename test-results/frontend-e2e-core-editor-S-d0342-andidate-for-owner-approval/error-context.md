# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend/e2e/core-editor.test.ts >> STORY-032-AC-3 presents deterministic 1280x720 candidate for owner approval
- Location: frontend/e2e/core-editor.test.ts:604:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
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
  522 |   await page.goto('/');
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
> 608 |   await page.goto('/');
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
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
  623 | test('STORY-018-AC-4 verifies view-mode and View-menu interaction', async ({
  624 |   page,
  625 | }) => {
  626 |   await page.setViewportSize({ width: 1280, height: viewportHeight });
  627 |   await page.goto('/');
  628 | 
  629 |   const editor = page.getByRole('radio', { name: 'Editor' });
  630 |   const editorPatchCount = await statePatchCount(page);
  631 |   await editor.click();
  632 |   await expect(editor).toBeChecked();
  633 |   await expectPaneVisibility(page, { editor: true, preview: false });
  634 |   await expectViewPatchSince(page, editorPatchCount, {
  635 |     editor: true,
  636 |     preview: false,
  637 |   });
  638 | 
  639 |   const splitPatchCount = await statePatchCount(page);
  640 |   await editor.press('ArrowRight');
  641 |   const split = page.getByRole('radio', { name: 'Split' });
  642 |   await expect(split).toBeChecked();
  643 |   await expectPaneVisibility(page, { editor: true, preview: true });
  644 |   await expectViewPatchSince(page, splitPatchCount, {
  645 |     editor: true,
  646 |     preview: true,
  647 |   });
  648 | 
  649 |   const previewPatchCount = await statePatchCount(page);
  650 |   await split.press('End');
  651 |   const preview = page.getByRole('radio', { name: 'Preview' });
  652 |   await expect(preview).toBeChecked();
  653 |   await expectPaneVisibility(page, { editor: false, preview: true });
  654 |   await expectViewPatchSince(page, previewPatchCount, {
  655 |     editor: false,
  656 |     preview: true,
  657 |   });
  658 | 
  659 |   const viewTrigger = page.getByRole('button', { name: 'View' });
  660 |   await viewTrigger.click();
  661 |   const viewMenu = page.getByRole('menu', { name: 'View' });
  662 |   const viewArrangement = viewMenu.getByRole('group', {
  663 |     name: 'View arrangement',
  664 |   });
  665 |   const menuEditor = viewArrangement.getByRole('menuitemradio', {
  666 |     name: 'Editor',
  667 |   });
  668 |   const menuPreview = viewArrangement.getByRole('menuitemradio', {
  669 |     name: 'Preview',
  670 |   });
  671 |   await expect(menuEditor).toHaveAttribute('data-state', 'unchecked');
  672 |   await expect(menuPreview).toHaveAttribute('data-state', 'checked');
  673 | 
  674 |   const showEditorPatchCount = await statePatchCount(page);
  675 |   await menuEditor.click();
  676 |   await expectPaneVisibility(page, { editor: true, preview: false });
  677 |   await expectViewPatchSince(page, showEditorPatchCount, {
  678 |     editor: true,
  679 |     preview: false,
  680 |   });
  681 | 
  682 |   await viewTrigger.click();
  683 |   await expect(viewMenu).toBeVisible();
  684 |   await expect(menuEditor).toHaveAttribute('data-state', 'checked');
  685 |   await expect(menuPreview).toHaveAttribute('data-state', 'unchecked');
  686 | });
  687 | 
```