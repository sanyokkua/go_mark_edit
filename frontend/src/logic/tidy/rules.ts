import type { Emphasis, List, Root, Strong } from 'mdast';
import { classifyCharacter } from 'micromark-util-classify-character';
import { visit } from 'unist-util-visit';

export interface SourceRange {
    from: number;
    to: number;
}

export type InlineMarkerNode = Emphasis | Strong;
export type BulletMarker = '-' | '*' | '+';

function previousCodePoint(source: string, offset: number): number | null {
    if (offset === 0) return null;
    const last = source.charCodeAt(offset - 1);
    if (last >= 0xdc00 && last <= 0xdfff && offset > 1) {
        const first = source.charCodeAt(offset - 2);
        if (first >= 0xd800 && first <= 0xdbff) return source.codePointAt(offset - 2) ?? null;
    }
    return last;
}

function nextCodePoint(source: string, offset: number): number | null {
    return offset < source.length ? (source.codePointAt(offset) ?? null) : null;
}

/** The opening and closing source delimiters of a parsed emphasis or strong node. */
export function inlineMarkerRanges(node: InlineMarkerNode): { open: SourceRange; close: SourceRange } | null {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    if (from === undefined || to === undefined) return null;
    const width = node.type === 'strong' ? 2 : 1;
    if (to - from < width * 2) return null;
    return { open: { from, to: from + width }, close: { from: to - width, to } };
}

/** Underscores here would remain attention delimiters under micromark's neighbour rules. */
export function canUseUnderscore(node: Emphasis, source: string): boolean {
    const range = inlineMarkerRanges(node);
    if (range === null) return false;
    return (
        classifyCharacter(previousCodePoint(source, range.open.from)) !== undefined &&
        classifyCharacter(nextCodePoint(source, range.close.to)) !== undefined
    );
}

export function isIntrawordEmphasis(node: Emphasis, source: string): boolean {
    return !canUseUnderscore(node, source);
}

/** A nested marker directly beside this node's marker cannot use the same character. */
export function adjacentInlineMarker(node: Emphasis): InlineMarkerNode[] {
    const range = inlineMarkerRanges(node);
    if (range === null) return [];
    return node.children.filter((child): child is InlineMarkerNode => {
        if (child.type !== 'emphasis' && child.type !== 'strong') return false;
        const childRange = inlineMarkerRanges(child);
        return (
            childRange !== null && (childRange.open.from === range.open.to || childRange.close.to === range.close.from)
        );
    });
}

export function touchesStrongParent(node: Emphasis, parent: Strong | null): boolean {
    if (parent === null) return false;
    const range = inlineMarkerRanges(node);
    const parentRange = inlineMarkerRanges(parent);
    return (
        range !== null &&
        parentRange !== null &&
        (range.open.from === parentRange.open.to || range.close.to === parentRange.close.from)
    );
}

/** The marker Format and Lint both expect for this parsed emphasis node. */
export function expectedEmphasisMarker(
    node: Emphasis,
    source: string,
    preferred: '_' | '*',
    parent: Strong | null = null,
): '_' | '*' {
    const initial = preferred === '_' && isIntrawordEmphasis(node, source) ? '*' : preferred;
    const neighbours = adjacentInlineMarker(node);
    const conflicts =
        (initial === '*' && touchesStrongParent(node, parent)) ||
        neighbours.some((child) =>
            child.type === 'strong' ? initial === '*' : expectedEmphasisMarker(child, source, preferred) === initial,
        );
    if (!conflicts) return initial;
    return initial === '_' ? '*' : canUseUnderscore(node, source) ? '_' : '*';
}

export function unorderedMarkerAt(list: List, source: string): BulletMarker | null {
    if (list.ordered) return null;
    const from = list.children[0]?.position?.start.offset;
    const marker = from === undefined ? undefined : source[from];
    return marker === '-' || marker === '*' || marker === '+' ? marker : null;
}

export function areAdjacentLists(previous: List, next: List, source: string): boolean {
    const from = previous.position?.end.offset;
    const to = next.position?.start.offset;
    return from !== undefined && to !== undefined && /^[\s>]*$/u.test(source.slice(from, to));
}

/** Alternate only when equal markers would join distinct adjacent unordered lists. */
export function expectedBulletMarker(
    list: List,
    previous: List | null,
    previousMarker: BulletMarker | null,
    source: string,
    preferred: BulletMarker,
): BulletMarker {
    if (
        previous !== null &&
        !previous.ordered &&
        previousMarker === preferred &&
        areAdjacentLists(previous, list, source)
    ) {
        return (['-', '*', '+'] as const).find((marker) => marker !== preferred) ?? preferred;
    }
    return preferred;
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
