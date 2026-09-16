import type { Page } from '@playwright/test';

import { expect, test } from '../support/harness';

const EDITOR_SURFACE_SELECTOR = '[data-editor-surface]';
const PREVIEW_SCROLL_CONTAINER_SELECTOR = 'section[aria-label="Preview pane"] > div';

const SECTION_COUNT = 150;
const CODE_BLOCK_AFTER_SECTION = 75;
const CODE_BLOCK_CONTENT_LINES = 23;
const CODE_BLOCK_FIRST_LINE = CODE_BLOCK_AFTER_SECTION * 4 + 1;
// Comfortably inside the 25-line code block (never near either of its edges), so seeking here
// cannot land in the ordinary paragraph before it, the way seeking to the block's own first line
// with a tolerant band was found to do against the real editor (see the "audit findings" note on
// the assertion below).
const CODE_BLOCK_INTERIOR_LINE = CODE_BLOCK_FIRST_LINE + 10;

const BLOCK_TOLERANCE_LINES = 4;
const TYPING_TOLERANCE_LINES = 5;
const PREVIEW_MAX_TOLERANCE_PX = 2;
const IDLE_WINDOW_MS = 700;

interface LinePair {
    editorLine: number;
    previewLine: number;
}

interface PreviewMetrics {
    scrollTop: number;
    maxScrollTop: number;
}

interface ScrollOffsets {
    editor: number;
    preview: number;
}

interface WindowGoBindings {
    go?: {
        appmodel?: {
            AppModelHandler?: {
                GetState?: (request: { id: string }) => Promise<unknown>;
            };
        };
        settings?: {
            SettingsHandler?: {
                GetSettings?: (request: { id: string }) => Promise<unknown>;
            };
        };
    };
}

interface AppStateResponse {
    data?: {
        snapshot?: {
            activeDocumentId?: string;
            documents?: Record<string, { view?: { scroll?: ScrollOffsets } }>;
        };
    };
}

interface SettingsResponse {
    data?: {
        editor?: {
            scrollSync?: boolean;
        };
    };
}

/**
 * About 150 uniform four-line sections (heading, blank, paragraph, blank) with
 * one 25-line fenced code block after the middle section, so the fixture has
 * both ordinary paragraph blocks and a `pre` block to align against.
 */
function buildLongDocument(): string {
    const lines: string[] = [];

    for (let section = 1; section <= SECTION_COUNT; section += 1) {
        lines.push(`## Section ${section}`, '', `Paragraph text for section ${section}.`, '');

        if (section === CODE_BLOCK_AFTER_SECTION) {
            lines.push('```text');
            for (let codeLine = 1; codeLine <= CODE_BLOCK_CONTENT_LINES; codeLine += 1) {
                lines.push(`code line ${codeLine}`);
            }
            lines.push('```', '');
        }
    }

    return lines.join('\n');
}

const LONG_DOCUMENT = buildLongDocument();

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

/**
 * Retries `read` until two samples taken 150 ms apart agree, so a caller never
 * reads a pane mid-flight while the controller is still catching up. A
 * transient read failure (a pane not mounted yet) counts as disagreement
 * rather than aborting the wait.
 */
async function settle<T>(read: () => Promise<T>, agree: (a: T, b: T) => boolean, maxAttempts = 40): Promise<T> {
    let lastError: unknown;

    async function attempt(): Promise<T | undefined> {
        try {
            return await read();
        } catch (error) {
            lastError = error;
            return undefined;
        }
    }

    let previous = await attempt();
    for (let count = 0; count < maxAttempts; count += 1) {
        await sleep(150);
        const next = await attempt();
        if (previous !== undefined && next !== undefined && agree(previous, next)) {
            return next;
        }
        previous = next;
    }

    const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
    throw new Error(`the value did not settle across two 150 ms samples${detail}`);
}

/**
 * Monaco's own DOM is confined to this one helper, so a future Monaco upgrade
 * only touches this function: the gutter renders a `.line-numbers` element per
 * visible line, and the smallest number among them is the topmost visible line.
 */
async function firstVisibleEditorLine(page: Page): Promise<number> {
    return page.evaluate((surfaceSelector): number => {
        const numbers = document.querySelectorAll(`${surfaceSelector} .margin-view-overlays .line-numbers`);
        let top = Number.POSITIVE_INFINITY;
        for (const element of numbers) {
            const value = Number(element.textContent);
            if (Number.isInteger(value) && value > 0 && value < top) top = value;
        }
        if (!Number.isFinite(top)) throw new Error('the Monaco gutter has no visible line numbers');
        return top;
    }, EDITOR_SURFACE_SELECTOR);
}

/**
 * The block occupying the preview container's own top edge: the last block that has already
 * started (its own top at or above the container's top, within 1 px) — so a block taller than the
 * viewport still reports itself, not the next block waiting below — falling back to the next block
 * about to appear when none has started yet (scrolled above the first tagged block).
 */
async function firstPreviewSourceLine(page: Page): Promise<number> {
    return page.evaluate((containerSelector): number => {
        const container = document.querySelector(containerSelector);
        if (container === null) throw new Error('the preview scroll container is absent');

        const containerTop = container.getBoundingClientRect().top;
        let started: { top: number; line: number } | null = null;
        let upcoming: { top: number; line: number } | null = null;
        for (const block of container.querySelectorAll('[data-source-line]')) {
            const line = Number(block.getAttribute('data-source-line'));
            if (!Number.isInteger(line) || line <= 0) continue;

            const top = block.getBoundingClientRect().top - containerTop;
            if (top <= 1) {
                if (started === null || top > started.top) started = { top, line };
            } else if (upcoming === null || top < upcoming.top) {
                upcoming = { top, line };
            }
        }
        const best = started ?? upcoming;
        if (best === null) throw new Error('no preview block is visible at the container top');
        return best.line;
    }, PREVIEW_SCROLL_CONTAINER_SELECTOR);
}

async function readLinePair(page: Page): Promise<LinePair> {
    const [editorLine, previewLine] = await Promise.all([firstVisibleEditorLine(page), firstPreviewSourceLine(page)]);
    return { editorLine, previewLine };
}

async function settledLinePair(page: Page): Promise<LinePair> {
    return settle(
        () => readLinePair(page),
        (a, b) => a.editorLine === b.editorLine && a.previewLine === b.previewLine,
    );
}

function expectAligned(pair: LinePair, toleranceLines: number): void {
    expect(Math.abs(pair.editorLine - pair.previewLine)).toBeLessThanOrEqual(toleranceLines);
}

async function previewScrollMetrics(page: Page): Promise<PreviewMetrics> {
    return page.evaluate((containerSelector): PreviewMetrics => {
        const container = document.querySelector(containerSelector);
        if (container === null) throw new Error('the preview scroll container is absent');
        return {
            scrollTop: container.scrollTop,
            maxScrollTop: container.scrollHeight - container.clientHeight,
        };
    }, PREVIEW_SCROLL_CONTAINER_SELECTOR);
}

async function settledPreviewMetrics(page: Page): Promise<PreviewMetrics> {
    return settle(
        () => previewScrollMetrics(page),
        (a, b) => a.scrollTop === b.scrollTop && a.maxScrollTop === b.maxScrollTop,
    );
}

/** Counts the preview's own `scroll` events over a window, entirely in the page so timing is not IPC-skewed. */
async function previewScrollEventsDuring(page: Page, milliseconds: number): Promise<number> {
    return page.evaluate(
        async ([containerSelector, duration]): Promise<number> => {
            const container = document.querySelector(containerSelector);
            if (container === null) throw new Error('the preview scroll container is absent');

            let events = 0;
            const onScroll = (): void => {
                events += 1;
            };
            container.addEventListener('scroll', onScroll);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, Number(duration));
            });
            container.removeEventListener('scroll', onScroll);
            return events;
        },
        [PREVIEW_SCROLL_CONTAINER_SELECTOR, milliseconds] as const,
    );
}

async function getState(page: Page): Promise<AppStateResponse> {
    return page.evaluate(async (): Promise<AppStateResponse> => {
        const getStateBinding = (globalThis as unknown as WindowGoBindings).go?.appmodel?.AppModelHandler?.GetState;
        if (getStateBinding === undefined) {
            throw new Error('the generated AppModelHandler.GetState binding is absent');
        }
        return (await getStateBinding({ id: crypto.randomUUID() })) as AppStateResponse;
    });
}

async function documentScrollOffsets(page: Page): Promise<ScrollOffsets> {
    const state = await getState(page);
    const activeDocumentId = state.data?.snapshot?.activeDocumentId;
    const scroll =
        activeDocumentId === undefined ? undefined : state.data?.snapshot?.documents?.[activeDocumentId]?.view?.scroll;
    if (scroll === undefined) {
        throw new Error('GetState did not report scroll offsets for the active document');
    }
    return scroll;
}

async function settledScrollOffsets(page: Page): Promise<ScrollOffsets> {
    return settle(
        () => documentScrollOffsets(page),
        (a, b) => a.editor === b.editor && a.preview === b.preview,
    );
}

async function scrollSyncSetting(page: Page): Promise<boolean> {
    return page.evaluate(async (): Promise<boolean> => {
        const getSettingsBinding = (globalThis as unknown as WindowGoBindings).go?.settings?.SettingsHandler
            ?.GetSettings;
        if (getSettingsBinding === undefined) {
            throw new Error('the generated SettingsHandler.GetSettings binding is absent');
        }
        const result = (await getSettingsBinding({ id: crypto.randomUUID() })) as SettingsResponse;
        const value = result.data?.editor?.scrollSync;
        if (typeof value !== 'boolean') {
            throw new Error('GetSettings did not report editor.scrollSync');
        }
        return value;
    });
}

async function nextAnimationFrame(page: Page): Promise<void> {
    await page.evaluate(async (): Promise<void> => {
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
        });
    });
}

async function wheelOverEditor(page: Page, deltaY: number): Promise<void> {
    const box = await page.locator(EDITOR_SURFACE_SELECTOR).boundingBox();
    if (box === null) throw new Error('the editor surface has no layout bounds');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, deltaY);
}

async function wheelOverPreview(page: Page, deltaY: number): Promise<void> {
    const box = await page.locator(PREVIEW_SCROLL_CONTAINER_SELECTOR).boundingBox();
    if (box === null) throw new Error('the preview scroll container has no layout bounds');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, deltaY);
}

async function clickEditorCenter(page: Page): Promise<void> {
    const box = await page.locator(EDITOR_SURFACE_SELECTOR).boundingBox();
    if (box === null) throw new Error('the editor surface has no layout bounds');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Wheels the editor toward `targetLine` a tick at a time until the gutter's
 * first visible line is within `band` of it. Monaco's own wheel handling
 * turns even a very large single wheel tick into a small, fairly constant
 * step, so reaching a distant target takes many small ticks rather than one
 * big one; the loop corrects direction every tick so it still converges
 * whichever side of the target it lands on.
 */
async function seekEditorToLine(page: Page, targetLine: number, band: number): Promise<void> {
    for (let tick = 0; tick < 400; tick += 1) {
        const current = await firstVisibleEditorLine(page);
        const diff = targetLine - current;
        if (Math.abs(diff) <= band) return;

        await wheelOverEditor(page, diff > 0 ? 4000 : -4000);
        await nextAnimationFrame(page);
    }
    throw new Error(`the editor did not reach line ${targetLine} while wheel-scrolling`);
}

/**
 * Wheels the preview toward `targetLine`, halving its step whenever a tick
 * crosses past the target. Unlike Monaco, the preview is a plain scrollable
 * element that moves proportionally to the wheel delta, so this converges in
 * a handful of ticks.
 */
async function seekPreviewToLine(page: Page, targetLine: number, band: number): Promise<void> {
    let step = 2000;
    for (let tick = 0; tick < 150; tick += 1) {
        const current = await firstPreviewSourceLine(page);
        const diff = targetLine - current;
        if (Math.abs(diff) <= band) return;

        await wheelOverPreview(page, diff > 0 ? step : -step);

        const next = await firstPreviewSourceLine(page);
        if ((targetLine - next) * diff < 0) step = Math.max(50, Math.floor(step / 2));
    }
    throw new Error(`the preview did not reach line ${targetLine} while wheel-scrolling`);
}

/**
 * Wheels the editor to its scroll boundary: repeats until the gutter's first
 * visible line stops changing. Monaco turns each tick into only a few lines
 * of movement (see {@link seekEditorToLine}), so reaching either end of a
 * long document takes a few hundred ticks.
 */
async function scrollEditorToLimit(page: Page, deltaY: number): Promise<void> {
    let previous = -1;
    for (let tick = 0; tick < 500; tick += 1) {
        await wheelOverEditor(page, deltaY);
        await nextAnimationFrame(page);
        const current = await firstVisibleEditorLine(page);
        if (current === previous) return;
        previous = current;
    }
    throw new Error('the editor did not settle while wheel-scrolling to its limit');
}

async function closeUntitled(page: Page): Promise<void> {
    const tab = page.getByRole('tab', { name: /Untitled/u });
    await expect(tab).toBeVisible();
    await tab
        .locator('..')
        .getByRole('button', { name: /^Close /u })
        .click();
}

async function openRecent(page: Page, filename: string): Promise<void> {
    await closeUntitled(page);
    const launcher = page.getByTestId('document-launcher');
    await expect(launcher).toBeVisible();
    await launcher.getByRole('button', { name: filename, exact: true }).click();
    await expect(page.getByRole('tab', { name: filename })).toBeVisible();
}

/**
 * Selects a View arrangement and waits two rendered frames afterwards, so the
 * pane that just hid or arrived has finished mounting or unmounting (and any
 * synchronization it owned has been torn down) before the next action.
 */
async function chooseArrangement(page: Page, name: 'Editor' | 'Split' | 'Preview'): Promise<void> {
    await page.getByRole('radiogroup', { name: 'View arrangement' }).getByRole('radio', { name, exact: true }).click();
    await nextAnimationFrame(page);
    await nextAnimationFrame(page);
}

/** Opens the document, switches to Split and waits for synchronized scrolling to report itself active. */
async function openInSplitWithSyncActive(page: Page, filename: string): Promise<void> {
    await openRecent(page, filename);
    await chooseArrangement(page, 'Split');
    await expect(page.locator(PREVIEW_SCROLL_CONTAINER_SELECTOR)).toHaveAttribute('data-scroll-sync', 'on');
}

async function openViewMenu(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'View options' })).toBeVisible();
}

async function closeMenu(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
}

test('keeps both panes on the same block while either pane scrolls', async ({ app }) => {
    const source = await app.writeDocument('long.md', LONG_DOCUMENT);
    await app.seedRecents([source]);
    await app.launch();

    const { page } = app;
    await openInSplitWithSyncActive(page, 'long.md');

    // Wheel over the editor: the preview follows to the same block.
    await seekEditorToLine(page, 150, 15);
    expectAligned(await settledLinePair(page), BLOCK_TOLERANCE_LINES);

    // Wheel over the preview: the editor follows back.
    await seekPreviewToLine(page, 300, 12);
    expectAligned(await settledLinePair(page), BLOCK_TOLERANCE_LINES);

    // The same agreement holds where the block at the top is the fenced code
    // block (a `pre`) rather than a heading or a paragraph: the preview has
    // exactly one `[data-source-line]` anchor for the whole 25-line block, so
    // wherever the editor sits inside it, the block reported at the top of the
    // preview is still the code block's own anchor line, not a neighbour — an
    // exact match rather than a line-count tolerance, since the block's own
    // height (about 25 source lines) is far larger than the tolerance windows
    // used elsewhere in this test. The seek target sits well inside the block
    // (audit finding: seeking to the block's own first line with a tolerant
    // band was found, against the real editor, to sometimes converge just
    // *before* the block instead of inside it, which this margin avoids).
    await seekEditorToLine(page, CODE_BLOCK_INTERIOR_LINE, 5);
    expect((await settledLinePair(page)).previewLine).toBe(CODE_BLOCK_FIRST_LINE);

    // Scroll to the end: the preview reaches its own maximum alongside the editor.
    await scrollEditorToLimit(page, 4000);
    const atEnd = await settledPreviewMetrics(page);
    expect(Math.abs(atEnd.scrollTop - atEnd.maxScrollTop)).toBeLessThanOrEqual(PREVIEW_MAX_TOLERANCE_PX);

    // Scroll back: both panes return to the top together.
    await scrollEditorToLimit(page, -4000);
    expect(await firstVisibleEditorLine(page)).toBe(1);
    const atTop = await settledPreviewMetrics(page);
    expect(atTop.scrollTop).toBe(0);

    // Once input stops, neither pane moves again for a good while. The preview's
    // own scroll events are counted for the idle window immediately, before
    // waiting on anything else to settle, so a drift that takes a while to quiet
    // down cannot hide behind a prior wait for the debounced persisted offsets
    // to catch up (audit finding: waiting for settledScrollOffsets first, before
    // starting the idle window, would let exactly that hide).
    const idleScrollEvents = await previewScrollEventsDuring(page, IDLE_WINDOW_MS);
    expect(idleScrollEvents).toBe(0);

    // The persisted offsets are equally still, over an idle window of their own.
    // They are debounced, so the pair is captured once it has settled and then
    // has to survive that window untouched. Comparing a settled read with a
    // fresh read taken straight afterwards asserts almost nothing, since
    // settling has just established that two reads in a row agree.
    const offsetsBeforeIdle = await settledScrollOffsets(page);
    await sleep(IDLE_WINDOW_MS);
    expect(await documentScrollOffsets(page)).toEqual(offsetsBeforeIdle);

    // Typing in the middle keeps the panes aligned, with a slightly looser tolerance.
    await seekEditorToLine(page, 450, 15);
    await clickEditorCenter(page);
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    expectAligned(await settledLinePair(page), TYPING_TOLERANCE_LINES);
});

test('aligns the newly shown pane when the arrangement changes', async ({ app }) => {
    const source = await app.writeDocument('long.md', LONG_DOCUMENT);
    await app.seedRecents([source]);
    await app.launch();

    const { page } = app;
    await openInSplitWithSyncActive(page, 'long.md');

    // Editor only, moved on its own, then back to Split: the preview aligns to it.
    await chooseArrangement(page, 'Editor');
    await seekEditorToLine(page, 200, 12);
    await chooseArrangement(page, 'Split');
    expectAligned(await settledLinePair(page), BLOCK_TOLERANCE_LINES);

    // Preview only, moved on its own, then back to Split: the editor aligns to the preview,
    // and the preview itself keeps its place instead of jumping to meet the editor. Outside
    // Split, synchronization is off and nothing suppresses the browser's own scroll-anchoring,
    // so the position is read only once it has settled, the same way settledLinePair does for
    // both panes together.
    await chooseArrangement(page, 'Preview');
    await seekPreviewToLine(page, 400, 12);
    await settledPreviewMetrics(page);
    const previewOnlyLine = await firstPreviewSourceLine(page);
    await chooseArrangement(page, 'Split');
    const afterPreviewJoins = await settledLinePair(page);
    expect(Math.abs(afterPreviewJoins.previewLine - previewOnlyLine)).toBeLessThanOrEqual(BLOCK_TOLERANCE_LINES);
    expectAligned(afterPreviewJoins, BLOCK_TOLERANCE_LINES);
});

test('turns synchronized scrolling off from the View menu and keeps the choice after relaunch', async ({ app }) => {
    const source = await app.writeDocument('long.md', LONG_DOCUMENT);
    await app.seedRecents([source]);
    await app.launch();

    const { page } = app;
    await openInSplitWithSyncActive(page, 'long.md');
    const previewContainer = page.locator(PREVIEW_SCROLL_CONTAINER_SELECTOR);

    await openViewMenu(page);
    const scrollSyncRow = page.getByRole('menuitemcheckbox', { name: 'Synchronized scrolling' });
    await expect(scrollSyncRow).toBeChecked();
    await scrollSyncRow.click();
    await closeMenu(page);

    await expect.poll(() => scrollSyncSetting(page)).toBe(false);
    await expect(previewContainer).not.toHaveAttribute('data-scroll-sync');

    const previewBeforeScroll = await previewScrollMetrics(page);
    await scrollEditorToLimit(page, 4000);
    const idleScrollEvents = await previewScrollEventsDuring(page, IDLE_WINDOW_MS);
    expect(idleScrollEvents).toBe(0);
    expect(await previewScrollMetrics(page)).toEqual(previewBeforeScroll);

    await app.relaunch();
    await expect(page.getByRole('tab', { name: 'Untitled' })).toBeVisible();
    await openViewMenu(page);
    await expect(page.getByRole('menuitemcheckbox', { name: 'Synchronized scrolling' })).not.toBeChecked();
    await closeMenu(page);

    await openRecent(page, 'long.md');
    await chooseArrangement(page, 'Split');
    await seekEditorToLine(page, 300, 12);

    await openViewMenu(page);
    const reenabledRow = page.getByRole('menuitemcheckbox', { name: 'Synchronized scrolling' });
    await expect(reenabledRow).not.toBeChecked();
    await reenabledRow.click();
    await closeMenu(page);

    await expect.poll(() => scrollSyncSetting(page)).toBe(true);
    await expect(previewContainer).toHaveAttribute('data-scroll-sync', 'on');
    expectAligned(await settledLinePair(page), BLOCK_TOLERANCE_LINES);
});
