import { SOURCE_LINE_ATTRIBUTE } from '../markdown/sourceLines';
import type { PreviewScrollPort, ScrollGeometryChange, SourceLineOffset } from './scrollSyncTypes';

/**
 * The preview pane's scroll port, over the element that scrolls the rendered
 * Markdown.
 *
 * Each subscription owns the listener or observers it registers, and the
 * function it returns ends them. `dispose` ends whatever is left, so the owner
 * of the port can drop it without waiting for its subscribers.
 */
export function createPreviewScrollPort(container: HTMLElement): PreviewScrollPort {
    const releases = new Set<() => void>();

    /** Wraps one subscription's teardown so it runs once, whether unsubscribed or disposed. */
    function track(teardown: () => void): () => void {
        const release = (): void => {
            if (releases.delete(release)) teardown();
        };

        releases.add(release);

        return release;
    }

    /**
     * Every annotated block's offset in the scroll content, in document order.
     *
     * The container is not the blocks' offset parent, so each offset is read
     * from the viewport rectangles of the block and of the container, and the
     * container's own scroll offset is added back.
     */
    function measureSourceLines(): readonly SourceLineOffset[] {
        const containerTop = container.getBoundingClientRect().top;
        const { scrollTop } = container;
        const offsets: SourceLineOffset[] = [];

        for (const block of container.querySelectorAll(`[${SOURCE_LINE_ATTRIBUTE}]`)) {
            const line = Number(block.getAttribute(SOURCE_LINE_ATTRIBUTE));
            if (!Number.isInteger(line) || line <= 0) continue;

            offsets.push({ line, top: block.getBoundingClientRect().top - containerTop + scrollTop });
        }

        return offsets;
    }

    return {
        getScrollTop: (): number => container.scrollTop,
        setScrollTop: (scrollTop: number): void => {
            container.scrollTop = scrollTop;
        },
        getMaxScrollTop: (): number => container.scrollHeight - container.clientHeight,
        measureSourceLines,
        onScroll: (listener: (scrollTop: number) => void): (() => void) => {
            // Read at delivery, so a listener always hears where the pane is now.
            const report = (): void => {
                listener(container.scrollTop);
            };

            container.addEventListener('scroll', report, { passive: true });

            return track((): void => {
                container.removeEventListener('scroll', report);
            });
        },
        onGeometryChange: (listener: (change: ScrollGeometryChange) => void): (() => void) => {
            // Re-rendered Markdown, edited text and re-anchored blocks all move the blocks below them.
            const content = new MutationObserver((): void => {
                listener('content');
            });

            content.observe(container, {
                attributeFilter: [SOURCE_LINE_ATTRIBUTE],
                attributes: true,
                characterData: true,
                childList: true,
                subtree: true,
            });

            /*
             * The pane's own box and the rendered content's box each change how
             * far the preview can scroll without changing the content itself.
             * Older webviews have no ResizeObserver, where the content changes
             * above still report.
             */
            let size: ResizeObserver | null = null;
            if (typeof ResizeObserver !== 'undefined') {
                size = new ResizeObserver((): void => {
                    listener('layout');
                });
                size.observe(container);
                if (container.firstElementChild !== null) size.observe(container.firstElementChild);
            }

            return track((): void => {
                content.disconnect();
                size?.disconnect();
            });
        },
        dispose: (): void => {
            for (const release of [...releases]) release();
        },
    };
}
