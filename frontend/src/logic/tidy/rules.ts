import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

export interface SourceRange {
    from: number;
    to: number;
}

export function protectedRanges(tree: Root, source: string): SourceRange[] {
    const ranges: SourceRange[] = [];
    visit(tree, (node) => {
        if (
            !['code', 'html', 'math', 'yaml'].includes(node.type) &&
            !(
                node.type === 'inlineMath' &&
                source.slice(node.position?.start.offset, node.position?.end.offset).includes('\n')
            ) &&
            !(
                node.type === 'inlineCode' &&
                source.slice(node.position?.start.offset, node.position?.end.offset).includes('\n')
            )
        )
            return;
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (from !== undefined && to !== undefined) ranges.push({ from, to });
    });
    return ranges.sort((a, b) => a.from - b.from);
}

export function hardBreakRanges(tree: Root): SourceRange[] {
    const ranges: SourceRange[] = [];
    visit(tree, 'break', (node) => {
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (from !== undefined && to !== undefined) ranges.push({ from, to });
    });
    return ranges;
}
