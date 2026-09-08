# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend/e2e/core-editor.test.ts >> STORY-018-AC-2 verifies the live editor preview flow
- Location: frontend/e2e/core-editor.test.ts:417:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  321 |       }>;
  322 |       source: string;
  323 |     } => {
  324 |       const editorInput = node.querySelector('textarea.inputarea');
  325 |       const caret = node.querySelector<HTMLElement>('.cursor');
  326 |       const sourceText = node.querySelector('.view-lines')?.textContent;
  327 |       if (
  328 |         editorInput === null ||
  329 |         caret === null ||
  330 |         sourceText === null ||
  331 |         sourceText === undefined
  332 |       ) {
  333 |         throw new Error('Monaco focused-session DOM is unavailable');
  334 |       }
  335 |       const caretBounds = caret.getBoundingClientRect();
  336 |       const selection = Array.from(
  337 |         node.querySelectorAll<HTMLElement>('.selected-text'),
  338 |         (element: HTMLElement) => {
  339 |           const bounds = element.getBoundingClientRect();
  340 | 
  341 |           return {
  342 |             height: bounds.height,
  343 |             left: bounds.left,
  344 |             top: bounds.top,
  345 |             width: bounds.width,
  346 |           };
  347 |         },
  348 |       );
  349 | 
  350 |       return {
  351 |         caret: { left: caretBounds.left, top: caretBounds.top },
  352 |         focused: document.activeElement === editorInput,
  353 |         selection,
  354 |         source: sourceText,
  355 |       };
  356 |     },
  357 |   );
  358 |   expect(sessionBeforePatch.focused).toBe(true);
  359 |   expect(sessionBeforePatch.selection.length).toBeGreaterThan(0);
  360 |   expect(sessionBeforePatch.source.replaceAll('\u00a0', ' ')).toContain(source);
  361 | 
  362 |   await expectContentFreeMetadataPatchSince(page, patchCount);
  363 | 
  364 |   const sessionAfterPatch = await monaco.evaluate(
  365 |     (
  366 |       node: Element,
  367 |     ): {
  368 |       caret: { left: number; top: number };
  369 |       focused: boolean;
  370 |       selection: Array<{
  371 |         height: number;
  372 |         left: number;
  373 |         top: number;
  374 |         width: number;
  375 |       }>;
  376 |       source: string;
  377 |     } => {
  378 |       const editorInput = node.querySelector('textarea.inputarea');
  379 |       const caret = node.querySelector<HTMLElement>('.cursor');
  380 |       const sourceText = node.querySelector('.view-lines')?.textContent;
  381 |       if (
  382 |         editorInput === null ||
  383 |         caret === null ||
  384 |         sourceText === null ||
  385 |         sourceText === undefined
  386 |       ) {
  387 |         throw new Error('Monaco focused-session DOM is unavailable');
  388 |       }
  389 |       const caretBounds = caret.getBoundingClientRect();
  390 |       const selection = Array.from(
  391 |         node.querySelectorAll<HTMLElement>('.selected-text'),
  392 |         (element: HTMLElement) => {
  393 |           const bounds = element.getBoundingClientRect();
  394 | 
  395 |           return {
  396 |             height: bounds.height,
  397 |             left: bounds.left,
  398 |             top: bounds.top,
  399 |             width: bounds.width,
  400 |           };
  401 |         },
  402 |       );
  403 | 
  404 |       return {
  405 |         caret: { left: caretBounds.left, top: caretBounds.top },
  406 |         focused: document.activeElement === editorInput,
  407 |         selection,
  408 |         source: sourceText,
  409 |       };
  410 |     },
  411 |   );
  412 | 
  413 |   expect(sessionAfterPatch).toEqual(sessionBeforePatch);
  414 | });
  415 | 
  416 | // Proves: STORY-018-AC-2
  417 | test('STORY-018-AC-2 verifies the live editor preview flow', async ({
  418 |   page,
  419 | }) => {
  420 |   await page.setViewportSize({ width: 1280, height: viewportHeight });
> 421 |   await page.goto('/');
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
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
```