import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const marker = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/iu;

/** Promote sanitized blockquotes whose first logical line is an alert marker. */
export function rehypeAlerts(): (tree: Root) => void {
    return (tree): void => {
        visit(tree, 'element', (node: Element): void => {
            if (node.tagName !== 'blockquote') return;
            const paragraph = node.children.find((child) => child.type === 'element');
            if (paragraph?.tagName !== 'p') return;
            const first = paragraph.children[0];
            if (first?.type !== 'text') return;
            const newline = first.value.indexOf('\n');
            const firstLine = newline < 0 ? first.value : first.value.slice(0, newline);
            const match = marker.exec(firstLine);
            const second = paragraph.children[1];
            const hardBreak =
                newline < 0 &&
                second?.type === 'element' &&
                second.tagName === 'br' &&
                second.position !== undefined &&
                second.position.start.line < second.position.end.line;
            if (match === null || (newline < 0 && paragraph.children.length > 1 && !hardBreak)) return;
            const kind = match[1].toLowerCase() as AlertKind;
            const remainder = newline < 0 ? '' : first.value.slice(newline + 1);
            if (remainder.length === 0) paragraph.children.shift();
            else first.value = remainder;
            if (hardBreak) {
                paragraph.children.shift();
                if (paragraph.children[0]?.type === 'text' && paragraph.children[0].value === '\n') {
                    paragraph.children.shift();
                }
            }
            if (paragraph.children.length === 0) node.children.splice(node.children.indexOf(paragraph), 1);
            node.tagName = 'div';
            node.properties = {
                ...node.properties,
                className: ['md-alert', `md-alert-${kind}`],
                role: 'note',
            };
            node.children.unshift({
                type: 'element',
                tagName: 'p',
                properties: { className: ['md-alert-title'] },
                children: [],
            });
        });
    };
}
