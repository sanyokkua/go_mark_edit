import type { Paragraph, Root } from 'mdast';
import { directiveFromMarkdown } from 'mdast-util-directive';
import { directive } from 'micromark-extension-directive';
import type { Extension } from 'micromark-util-types';
import type { Processor } from 'unified';
import { visit } from 'unist-util-visit';

const kinds = new Set(['note', 'tip', 'important', 'warning', 'caution']);

/** Register only the concrete container construct; text and leaf directives remain prose. */
export function remarkContainerSyntax(this: Processor): void {
    const container = directive().flow?.[58];
    const constructs = Array.isArray(container) ? container : [container];
    const concrete = constructs.filter((construct) => construct?.concrete === true);
    if (concrete.length !== 1) throw new Error('Container directive syntax is unavailable');
    const data = this.data();
    (data.micromarkExtensions ??= []).push({ flow: { 58: concrete } } as Extension);
    (data.fromMarkdownExtensions ??= []).push(directiveFromMarkdown());
}

/** Rewrite known admonitions as ordinary blockquotes before HTML conversion. */
export function remarkContainers(): (tree: Root, file: { value: unknown }) => void {
    return (tree, file): void => {
        const source = String(file.value);
        visit(tree, 'containerDirective', (node, index, parent) => {
            if (parent === undefined || index === undefined) return;
            const kind = node.name.toLowerCase();
            if (!kinds.has(kind)) {
                const start = node.position?.start.offset;
                const end = node.position?.end.offset;
                const literal = start === undefined || end === undefined ? '' : source.slice(start, end);
                parent.children[index] = {
                    type: 'paragraph',
                    children: [{ type: 'text', value: literal }],
                    position: node.position,
                };
                return;
            }
            const marker: Paragraph = {
                type: 'paragraph',
                children: [{ type: 'text', value: `[!${kind.toUpperCase()}]` }],
                position: node.position,
            };
            if (node.children[0]?.type === 'paragraph' && node.children[0].data?.directiveLabel === true) {
                node.children.shift();
            }
            // Keep the replacement's child array shared with the traversed node so
            // nested directives rewritten later update the rendered blockquote.
            node.children.unshift(marker);
            parent.children[index] = {
                type: 'blockquote',
                children: node.children,
                position: node.position,
            };
        });
    };
}
