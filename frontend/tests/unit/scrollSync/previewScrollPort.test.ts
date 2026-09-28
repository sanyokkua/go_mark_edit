import { createPreviewScrollPort } from '../../../src/logic/scrollSync/previewScrollPort';
import type { ScrollGeometryChange } from '../../../src/logic/scrollSync/scrollSyncTypes';

/** Where the preview sits in the viewport; jsdom has no layout, so every rectangle below is stubbed. */
const CONTAINER_TOP = 80;

function rectAt(top: number): DOMRect {
    return {
        bottom: top,
        height: 0,
        left: 0,
        right: 0,
        toJSON: (): Record<string, never> => ({}),
        top,
        width: 0,
        x: 0,
        y: top,
    };
}

/**
 * A preview whose blocks report the rectangle the browser would report for a
 * block `contentTop` pixels down the scroll content: the preview's own top,
 * plus the block's place in the content, minus how far the preview is scrolled.
 */
function createPreview(): HTMLElement {
    const container = document.createElement('div');
    container.getBoundingClientRect = (): DOMRect => rectAt(CONTAINER_TOP);
    document.body.append(container);

    return container;
}

/** Gives the preview a browser-like scroll: an assignment past the end stops at the last scrollable pixel. */
function stubScrollGeometry(container: HTMLElement, scrollHeight: number, clientHeight: number): void {
    let scrollTop = 0;
    Object.defineProperties(container, {
        clientHeight: { configurable: true, get: (): number => clientHeight },
        scrollHeight: { configurable: true, get: (): number => scrollHeight },
        scrollTop: {
            configurable: true,
            get: (): number => scrollTop,
            set: (next: number): void => {
                scrollTop = Math.min(Math.max(next, 0), scrollHeight - clientHeight);
            },
        },
    });
}

function addBlock(container: HTMLElement, parent: Element, tagName: string, line: string, contentTop = 0): HTMLElement {
    const block = document.createElement(tagName);
    block.setAttribute('data-source-line', line);
    block.getBoundingClientRect = (): DOMRect => rectAt(CONTAINER_TOP + contentTop - container.scrollTop);
    parent.append(block);

    return block;
}

/** Mutation records reach an observer in a microtask; this waits past it. */
function deliverMutations(): Promise<void> {
    return new Promise((resolve): void => {
        setTimeout(resolve, 0);
    });
}

/** jsdom ships no ResizeObserver, so a preview that watches for resizes needs one installed. */
class FakeResizeObserver {
    static readonly instances: FakeResizeObserver[] = [];
    readonly observed = new Set<Element>();
    disconnected = false;

    constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this);
    }

    observe(target: Element): void {
        this.observed.add(target);
    }

    unobserve(target: Element): void {
        this.observed.delete(target);
    }

    disconnect(): void {
        this.observed.clear();
        this.disconnected = true;
    }

    /** Reports a resize of one element this observer watches. */
    resize(target: Element): void {
        if (!this.observed.has(target)) return;
        this.callback([{ target } as ResizeObserverEntry], this);
    }
}

function installResizeObserver(): void {
    FakeResizeObserver.instances.length = 0;
    globalThis.ResizeObserver = FakeResizeObserver;
}

afterEach((): void => {
    document.body.innerHTML = '';
    delete (globalThis as Partial<typeof globalThis>).ResizeObserver;
});

it('measures source-line offsets in document order relative to the scroll content', () => {
    const container = createPreview();
    addBlock(container, container, 'h1', '1', 0);
    addBlock(container, container, 'p', '3', 120);
    const list = addBlock(container, container, 'ul', '5', 240);
    addBlock(container, list, 'li', '5', 240);
    addBlock(container, list, 'li', '6', 280);
    // Values the sanitizer would never admit, and that no block can be anchored to.
    addBlock(container, container, 'p', '0', 300);
    addBlock(container, container, 'p', '-4', 320);
    addBlock(container, container, 'p', '2.5', 340);
    addBlock(container, container, 'p', 'eight', 360);
    addBlock(container, container, 'p', '', 380);
    const quote = addBlock(container, container, 'blockquote', '9', 400);
    addBlock(container, quote, 'p', '10', 400);
    addBlock(container, container, 'table', '12', 520);
    addBlock(container, container, 'tr', '13', 560);
    // Laid out above the block before it, so an implementation that sorts by
    // offset instead of keeping document order reports these two the wrong way round.
    addBlock(container, container, 'p', '16', 500);
    // A block of some other pane is not this preview's to measure.
    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    addBlock(container, elsewhere, 'p', '18', 40);
    container.scrollTop = 200;

    const port = createPreviewScrollPort(container);

    expect(port.measureSourceLines()).toEqual([
        { line: 1, top: 0 },
        { line: 3, top: 120 },
        { line: 5, top: 240 },
        { line: 5, top: 240 },
        { line: 6, top: 280 },
        { line: 9, top: 400 },
        { line: 10, top: 400 },
        { line: 12, top: 520 },
        { line: 13, top: 560 },
        { line: 16, top: 500 },
    ]);
});

it('reports scroll events and writes scroll offsets', () => {
    const container = createPreview();
    stubScrollGeometry(container, 700, 400);
    const port = createPreviewScrollPort(container);
    const onScroll = jest.fn<void, [number]>();

    expect(port.getMaxScrollTop()).toBe(300);

    const unsubscribe = port.onScroll(onScroll);
    container.scrollTop = 120;
    container.dispatchEvent(new Event('scroll'));

    expect(port.getScrollTop()).toBe(120);
    expect(onScroll.mock.calls).toEqual([[120]]);

    // The preview cannot reach 340, and a listener hears where the pane now is rather than what was asked for.
    port.setScrollTop(340);
    container.dispatchEvent(new Event('scroll'));

    expect(port.getScrollTop()).toBe(300);
    expect(onScroll.mock.calls).toEqual([[120], [300]]);

    unsubscribe();
    container.scrollTop = 40;
    container.dispatchEvent(new Event('scroll'));

    expect(onScroll).toHaveBeenCalledTimes(2);
});

it('reports a content change when rendered source lines change', async () => {
    const container = createPreview();
    const list = addBlock(container, container, 'ul', '5', 0);
    const item = addBlock(container, list, 'li', '5', 0);
    const text = document.createTextNode('first');
    item.append(text);
    const port = createPreviewScrollPort(container);
    const onGeometryChange = jest.fn<void, [ScrollGeometryChange]>();

    // jsdom has no ResizeObserver, so this subscription also proves the guard around it.
    expect(globalThis.ResizeObserver).toBeUndefined();

    const unsubscribe = port.onGeometryChange(onGeometryChange);

    // Rewritten text deep in the preview reflows the blocks below it.
    text.data = 'first, rewritten at length';
    await deliverMutations();

    expect(onGeometryChange.mock.calls).toEqual([['content']]);

    addBlock(container, container, 'p', '7', 60);
    await deliverMutations();

    expect(onGeometryChange.mock.calls).toEqual([['content'], ['content']]);

    item.setAttribute('data-source-line', '6');
    await deliverMutations();

    expect(onGeometryChange.mock.calls).toEqual([['content'], ['content'], ['content']]);

    // A restyled block is not a new anchor, so it is not a change the map has to be rebuilt for.
    item.setAttribute('class', 'highlighted');
    await deliverMutations();

    expect(onGeometryChange).toHaveBeenCalledTimes(3);

    unsubscribe();
    addBlock(container, container, 'p', '9', 120);
    await deliverMutations();

    expect(onGeometryChange).toHaveBeenCalledTimes(3);
});

it('reports a layout change when the preview resizes', () => {
    const container = createPreview();
    const content = document.createElement('section');
    container.append(content);
    installResizeObserver();
    const port = createPreviewScrollPort(container);
    const onGeometryChange = jest.fn<void, [ScrollGeometryChange]>();

    const unsubscribe = port.onGeometryChange(onGeometryChange);

    expect(FakeResizeObserver.instances).toHaveLength(1);

    const observer = FakeResizeObserver.instances[0];
    expect([...observer.observed]).toEqual([container, content]);

    // The pane is given more or less room, so the same content scrolls a different distance.
    observer.resize(container);

    expect(onGeometryChange.mock.calls).toEqual([['layout']]);

    // The rendered content changes height, as when an image finishes loading.
    observer.resize(content);

    expect(onGeometryChange.mock.calls).toEqual([['layout'], ['layout']]);

    unsubscribe();

    expect(observer.disconnected).toBe(true);

    observer.resize(container);

    expect(onGeometryChange).toHaveBeenCalledTimes(2);
});

it('stops observing after dispose', async () => {
    const container = createPreview();
    const content = document.createElement('section');
    container.append(content);
    stubScrollGeometry(container, 700, 400);
    installResizeObserver();
    const port = createPreviewScrollPort(container);
    const onScroll = jest.fn<void, [number]>();
    const onGeometryChange = jest.fn<void, [ScrollGeometryChange]>();
    // Whoever owns the port can drop it while its subscribers are still subscribed.
    const stopScroll = port.onScroll(onScroll);
    const stopGeometry = port.onGeometryChange(onGeometryChange);
    const observer = FakeResizeObserver.instances[0];

    port.dispose();

    container.scrollTop = 200;
    container.dispatchEvent(new Event('scroll'));
    addBlock(container, container, 'p', '3', 60);
    await deliverMutations();
    observer.resize(container);

    expect(onScroll).not.toHaveBeenCalled();
    expect(onGeometryChange).not.toHaveBeenCalled();
    expect(observer.disconnected).toBe(true);
    expect((): void => {
        stopScroll();
        stopGeometry();
    }).not.toThrow();
});
