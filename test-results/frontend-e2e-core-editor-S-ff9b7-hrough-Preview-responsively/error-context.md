# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend/e2e/core-editor.test.ts >> STORY-022-AC-5 round trips an edit through Preview responsively
- Location: frontend/e2e/core-editor.test.ts:230:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  138 |     .toBe(true);
  139 | }
  140 | 
  141 | async function expectViewPatchSince(
  142 |   page: Page,
  143 |   patchCount: number,
  144 |   expected: { editor: boolean; preview: boolean },
  145 | ): Promise<void> {
  146 |   await expect
  147 |     .poll(() =>
  148 |       page.evaluate(
  149 |         ({
  150 |           expectedState,
  151 |           from,
  152 |         }: {
  153 |           expectedState: { editor: boolean; preview: boolean };
  154 |           from: number;
  155 |         }): boolean => {
  156 |           const mirrorWindow = window as Window & {
  157 |             readonly __GME_STATE_PATCHES__?: readonly unknown[];
  158 |           };
  159 |           const patches = mirrorWindow.__GME_STATE_PATCHES__ ?? [];
  160 | 
  161 |           return patches.slice(from).some((patch: unknown): boolean => {
  162 |             if (typeof patch !== 'object' || patch === null) {
  163 |               return false;
  164 |             }
  165 |             const documents = (patch as Record<string, unknown>).documents;
  166 |             if (typeof documents !== 'object' || documents === null) {
  167 |               return false;
  168 |             }
  169 |             const upsert = (documents as Record<string, unknown>).upsert;
  170 |             if (typeof upsert !== 'object' || upsert === null) {
  171 |               return false;
  172 |             }
  173 |             const document = (upsert as Record<string, unknown>)[
  174 |               'mock-document'
  175 |             ];
  176 |             if (typeof document !== 'object' || document === null) {
  177 |               return false;
  178 |             }
  179 |             const view = (document as Record<string, unknown>).view;
  180 | 
  181 |             return (
  182 |               typeof view === 'object' &&
  183 |               view !== null &&
  184 |               (view as Record<string, unknown>).editorVisible ===
  185 |                 expectedState.editor &&
  186 |               (view as Record<string, unknown>).previewVisible ===
  187 |                 expectedState.preview
  188 |             );
  189 |           });
  190 |         },
  191 |         { expectedState: expected, from: patchCount },
  192 |       ),
  193 |     )
  194 |     .toBe(true);
  195 | }
  196 | 
  197 | // Proves: STORY-018-AC-1
  198 | test('STORY-018-AC-1 verifies responsive editor dimensions', async ({
  199 |   page,
  200 | }) => {
  201 |   const runtimeErrors = collectRuntimeErrors(page);
  202 | 
  203 |   for (const width of viewports) {
  204 |     await page.setViewportSize({ width, height: viewportHeight });
  205 |     await page.goto('/');
  206 | 
  207 |     const editor = page.getByLabel('Editor pane', { exact: true });
  208 |     const monaco = page.locator('.monaco-editor');
  209 |     await expect(editor).toBeVisible();
  210 |     await expect(monaco).toBeVisible();
  211 | 
  212 |     const bounds = await monaco.boundingBox();
  213 |     expect(bounds?.height).toBeGreaterThan(200);
  214 |     await expect
  215 |       .poll(() =>
  216 |         page.evaluate(
  217 |           (): boolean =>
  218 |             document.documentElement.scrollWidth <= window.innerWidth &&
  219 |             document.body.scrollWidth <= window.innerWidth,
  220 |         ),
  221 |       )
  222 |       .toBe(true);
  223 |     await expectCollapsedAssistant(page);
  224 |   }
  225 | 
  226 |   expect(runtimeErrors).toEqual([]);
  227 | });
  228 | 
  229 | // Proves: STORY-022-AC-5
  230 | test('STORY-022-AC-5 round trips an edit through Preview responsively', async ({
  231 |   page,
  232 | }) => {
  233 |   const runtimeErrors = collectRuntimeErrors(page);
  234 | 
  235 |   for (const width of viewports) {
  236 |     const source = `round-trip-${width}`;
  237 |     await page.setViewportSize({ width, height: viewportHeight });
> 238 |     await page.goto('/');
      |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  239 | 
  240 |     const editorPane = page.getByLabel('Editor pane', { exact: true });
  241 |     const previewPane = page.getByLabel('Preview pane', { exact: true });
  242 |     const monaco = page.locator('.monaco-editor');
  243 |     const input = monaco.locator('textarea.inputarea');
  244 |     await expect(monaco).toBeVisible();
  245 |     await input.focus();
  246 |     await page.keyboard.insertText(source);
  247 |     await expect(monaco.locator('.view-lines')).toContainText(source);
  248 | 
  249 |     await chooseArrangement(page, 'Preview');
  250 |     await expect(editorPane).toBeHidden();
  251 |     await expect(monaco).toBeHidden();
  252 |     await expect(previewPane).toContainText(source);
  253 | 
  254 |     await chooseArrangement(page, 'Editor');
  255 |     await expect(editorPane).toBeVisible();
  256 |     await expect(monaco).toBeVisible();
  257 |     await expect(monaco.locator('.view-lines')).toContainText(source);
  258 |     const bounds = await monaco.boundingBox();
  259 |     expect(bounds?.height).toBeGreaterThan(200);
  260 | 
  261 |     await input.click({ force: true });
  262 |     await page.keyboard.press('Meta+z');
  263 |     await chooseArrangement(page, 'Split');
  264 |     await expect(previewPane).toBeVisible();
  265 |     await expect(previewPane).not.toContainText(source);
  266 |     await expect
  267 |       .poll(() =>
  268 |         page.evaluate(
  269 |           (): boolean =>
  270 |             document.documentElement.scrollWidth <= window.innerWidth &&
  271 |             document.body.scrollWidth <= window.innerWidth,
  272 |         ),
  273 |       )
  274 |       .toBe(true);
  275 |   }
  276 | 
  277 |   expect(runtimeErrors).toEqual([]);
  278 | });
  279 | 
  280 | // Proves: STORY-022-AC-4
  281 | test('STORY-022-AC-4 (EC-DOCS-12) keeps a focused Monaco source, caret, and selection across a metadata patch', async ({
  282 |   page,
  283 | }) => {
  284 |   await page.setViewportSize({ width: 1280, height: viewportHeight });
  285 |   await page.goto('/');
  286 | 
  287 |   const monaco = page.locator('.monaco-editor');
  288 |   const input = monaco.locator('textarea.inputarea');
  289 |   const source = 'focused local working edit';
  290 |   const patchCount = await statePatchCount(page);
  291 |   await input.click({ force: true });
  292 |   await page.keyboard.insertText(source);
  293 |   await input.focus();
  294 |   await input.press('Shift+ArrowLeft');
  295 |   await expect
  296 |     .poll(() =>
  297 |       monaco.evaluate((node: Element): boolean =>
  298 |         Array.from(
  299 |           node.querySelectorAll<HTMLElement>('.selected-text'),
  300 |           (element: HTMLElement): boolean => {
  301 |             const bounds = element.getBoundingClientRect();
  302 | 
  303 |             return bounds.width > 0 && bounds.height > 0;
  304 |           },
  305 |         ).some(Boolean),
  306 |       ),
  307 |     )
  308 |     .toBe(true);
  309 | 
  310 |   const sessionBeforePatch = await monaco.evaluate(
  311 |     (
  312 |       node: Element,
  313 |     ): {
  314 |       caret: { left: number; top: number };
  315 |       focused: boolean;
  316 |       selection: Array<{
  317 |         height: number;
  318 |         left: number;
  319 |         top: number;
  320 |         width: number;
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
```