import type { Element, Root } from 'hast';
import type { Schema } from 'hast-util-sanitize';

/**
 * Hast/DOM attribute carrying a rendered preview block's one-based Markdown
 * source line. Synchronized scrolling reads it back to map a rendered block
 * to the editor line whose source produced it.
 */
export const SOURCE_LINE_ATTRIBUTE = 'data-source-line';

/** Rendered block-level tags annotated with their Markdown source line. */
export const SOURCE_LINE_TAGS = [
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'ul',
    'ol',
    'li',
    'pre',
    'table',
    'tr',
    'hr',
] as const;

const sourceLineTagNames: ReadonlySet<string> = new Set<string>(SOURCE_LINE_TAGS);

/**
 * GFM footnote definitions render inside a generated `section` at the end of
 * the document, in first-reference order rather than the order their
 * definitions appear in the source. Their descendants' source positions are
 * therefore not usable as scroll anchors.
 */
function isFootnoteSection(node: Element): boolean {
    return node.tagName === 'section' && node.properties.dataFootnotes !== undefined;
}

/**
 * Rehype plugin that sets `properties.dataSourceLine` (rendered as
 * `data-source-line`) on every element whose tag is in `SOURCE_LINE_TAGS` and
 * whose position survived parsing.
 *
 * Walks the tree iteratively with an explicit stack, never recursion or
 * `unist-util-visit`, and never descends into the GFM footnote section.
 */
export function rehypeSourceLines(): (tree: Root) => void {
    return function transformer(tree: Root): void {
        const pending: Array<Root | Element> = [tree];
        let node = pending.pop();

        while (node !== undefined) {
            for (const child of node.children) {
                if (child.type !== 'element' || isFootnoteSection(child)) continue;

                if (child.position !== undefined && sourceLineTagNames.has(child.tagName)) {
                    child.properties = {
                        ...child.properties,
                        dataSourceLine: child.position.start.line,
                    };
                }

                pending.push(child);
            }

            node = pending.pop();
        }
    };
}

/**
 * Returns a copy of `attributes` with `dataSourceLine` — restricted to
 * positive integers — allowed on every `SOURCE_LINE_TAGS` entry, so
 * `rehype-sanitize` keeps the attribute `rehypeSourceLines` sets instead of
 * stripping it.
 */
export function withSourceLineAttributes(
    attributes: NonNullable<Schema['attributes']>,
): NonNullable<Schema['attributes']> {
    const withSourceLine: NonNullable<Schema['attributes']> = { ...attributes };

    for (const tag of SOURCE_LINE_TAGS) {
        withSourceLine[tag] = [...(attributes[tag] ?? []), ['dataSourceLine', /^[1-9][0-9]*$/]];
    }

    return withSourceLine;
}
