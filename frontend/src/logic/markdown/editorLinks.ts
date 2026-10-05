import type { Definition, Root } from 'mdast';
import { visit } from 'unist-util-visit';

import { parseFull } from '../tidy/parser';

export interface EditorLink {
    href: string;
    range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    };
}

/** Links are read from the same Full syntax tree as preview and tidy. */
export function extractEditorLinks(source: string): EditorLink[] {
    const tree: Root = parseFull(source);
    const definitions = new Map<string, string>();
    visit(tree, 'definition', (node: Definition): void => {
        if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    });
    const links: EditorLink[] = [];
    visit(tree, (node): void => {
        if (node.type !== 'link' && node.type !== 'linkReference') return;
        const href = node.type === 'link' ? node.url : definitions.get(node.identifier);
        if (href === undefined || node.position === undefined) return;
        links.push({
            href,
            range: {
                startLineNumber: node.position.start.line,
                startColumn: node.position.start.column,
                endLineNumber: node.position.end.line,
                endColumn: node.position.end.column,
            },
        });
    });
    return links;
}
