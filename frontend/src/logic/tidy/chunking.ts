import type { Root } from 'mdast';
import { EXIT, visit } from 'unist-util-visit';

import { utf8ByteLength } from '../utils/utf8ByteLength';
import { parseFull } from './parser';
import type { SourceRange } from './rules';

export interface TidyChunk {
    offset: number;
    text: string;
}

const chunkBytes = 256 * 1024;

function closingBracket(value: string): number {
    for (let index = 0; index < value.length; index++) {
        if (value[index] !== ']') continue;
        let slashes = 0;
        while (value[index - slashes - 1] === '\\') slashes++;
        if (slashes % 2 === 0) return index;
    }
    return -1;
}

function withoutContainerPrefix(line: string): string {
    return line.replace(/^(?:[ \t]+|>[ \t]?|[-+*][ \t]+|\d{1,9}[.)][ \t]+)*/u, '');
}

function hasGlobalReference(tree: Root): boolean {
    let found = false;
    visit(tree, (node) => {
        if (node.type !== 'definition' && node.type !== 'footnoteDefinition') return;
        found = true;
        return EXIT;
    });
    return found;
}

function collectCodeRanges(tree: Root): SourceRange[] {
    const ranges: SourceRange[] = [];
    visit(tree, 'code', (node) => {
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (from !== undefined && to !== undefined) ranges.push({ from, to });
    });
    return ranges;
}

function buildValidatedChunks(source: string, boundaries: number[], referenceCandidates: Set<number>): TidyChunk[] {
    if (boundaries.length === 1) return [{ offset: 0, text: source }];
    const chunks: TidyChunk[] = [];
    for (let index = 0; index < boundaries.length; index++) {
        const from = boundaries[index];
        chunks.push({ offset: from, text: source.slice(from, boundaries[index + 1] ?? source.length) });
    }
    // Container indentation is parser context, not a fixed number of prefix spaces.
    // Confirm only definition-shaped chunks with Full syntax so indented/fenced code
    // and paragraph lookalikes do not disable chunking. Each candidate is parsed once.
    for (const index of referenceCandidates) {
        if (hasGlobalReference(parseFull(chunks[index].text))) return [{ offset: 0, text: source }];
    }
    return chunks;
}

function consumeDirectiveMarker(line: string, directives: number[]): boolean {
    const marker = /^ {0,3}(:{3,})(?!:)(.*)$/u.exec(line);
    if (marker === null) return false;
    if (marker[2].trim() === '') {
        if (marker[1].length >= (directives.at(-1) ?? Infinity)) directives.pop();
    } else directives.push(marker[1].length);
    return true;
}

function htmlBlockEnd(line: string): RegExp | null {
    if (line.includes('<!--')) return /-->/u;
    if (line.includes('<![CDATA[')) return /\]\]>/u;
    if (/^ {0,3}<\?/u.test(line)) return /\?>/u;
    if (/^ {0,3}<![A-Z]/u.test(line)) return />/u;
    const tag = /^ {0,3}<(script|pre|style|textarea)(?:[\s>]|$)/iu.exec(line);
    return tag === null ? null : new RegExp(String.raw`</${tag[1]}[ \t]*>`, 'iu');
}

function nextReferenceLabel(
    candidate: string,
    pending: boolean,
    blank: boolean,
    candidates: Set<number>,
    boundaryIndex: number,
): boolean {
    if (candidate.startsWith('[') || pending) {
        const close = closingBracket(candidate);
        if (close >= 0) {
            if (candidate.slice(close).startsWith(']:')) candidates.add(boundaryIndex);
            pending = false;
        } else pending = !blank;
    }
    return blank ? false : pending;
}

/** Split only at top-level, blank-line-separated headings. Offsets remain UTF-16. */
export function splitIntoChunks(source: string): TidyChunk[] {
    if (utf8ByteLength(source) <= chunkBytes) return [{ offset: 0, text: source }];

    const boundaries: number[] = [0];
    let yaml = false;
    let fence: { marker: string; length: number } | null = null;
    let codeRanges: SourceRange[] | null = null;
    let math: number | null = null;
    let htmlEnd: RegExp | null = null;
    let html = false;
    const directives: number[] = [];
    let previousBlank = false;
    let pendingReferenceLabel = false;
    const referenceCandidates = new Set<number>();
    let offset = 0;
    let lineNumber = 0;
    while (offset < source.length) {
        const newline = source.indexOf('\n', offset);
        const end = newline < 0 ? source.length : newline;
        const line = source.slice(offset, end);
        const blank = /^[ \t]*$/u.test(line);
        const candidate = withoutContainerPrefix(line);
        if (
            codeRanges === null &&
            !yaml &&
            fence === null &&
            math === null &&
            htmlEnd === null &&
            !html &&
            candidate !== line &&
            /^(`{3,}|~{3,})/u.test(candidate)
        ) {
            // A prefixed fence can close with different indentation or end with its
            // container. Resolve that context once with Full syntax, before a later
            // root fence can be mistaken for its close. Root-only fences stay lexical.
            const tree = parseFull(source);
            if (hasGlobalReference(tree)) return [{ offset: 0, text: source }];
            referenceCandidates.clear();
            codeRanges = collectCodeRanges(tree);
        }
        const codeLine = codeRanges?.some((range) => range.from < end + 1 && range.to > offset) ?? false;
        const outside =
            !codeLine &&
            !yaml &&
            fence === null &&
            math === null &&
            htmlEnd === null &&
            !html &&
            directives.length === 0;
        const possibleReferenceLine =
            !codeLine && !yaml && fence === null && math === null && htmlEnd === null && !html;
        if (offset > 0 && outside && previousBlank && /^#{1,6}(?:[ \t]|$)/u.test(line)) boundaries.push(offset);

        if (codeLine) {
            pendingReferenceLabel = false;
        } else if (lineNumber === 0 && /^\uFEFF?---[ \t]*$/u.test(line)) yaml = true;
        else if (yaml) {
            if (/^(?:---|\.\.\.)[ \t]*$/u.test(line)) yaml = false;
        } else if (htmlEnd !== null) {
            if (htmlEnd.test(line)) htmlEnd = null;
        } else if (fence !== null) {
            const close = new RegExp(String.raw`^ {0,3}${fence.marker}{${fence.length},}[ \t]*$`, 'u');
            if (close.test(line)) fence = null;
        } else if (math !== null) {
            const close = /^ {0,3}(\${2,})[ \t]*$/u.exec(line);
            if (close !== null && close[1].length >= math) math = null;
        } else if (html) {
            if (blank) html = false;
        } else if (!consumeDirectiveMarker(line, directives)) {
            const ending = htmlBlockEnd(line);
            if (ending !== null) {
                if (!ending.test(line.slice(line.indexOf('<') + 1))) htmlEnd = ending;
            } else if (/^ {0,3}<\/?[A-Za-z][^>]*>/u.test(line)) html = true;
            else {
                const open = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
                if (codeRanges === null && open !== null) fence = { marker: open[1][0], length: open[1].length };
                else {
                    const mathOpen = /^ {0,3}(\${2,})[^$]*$/u.exec(line);
                    if (mathOpen !== null) math = mathOpen[1].length;
                }
            }
        }
        if (
            codeRanges === null &&
            possibleReferenceLine &&
            !yaml &&
            fence === null &&
            math === null &&
            htmlEnd === null &&
            !html
        ) {
            pendingReferenceLabel = nextReferenceLabel(
                candidate,
                pendingReferenceLabel,
                blank,
                referenceCandidates,
                boundaries.length - 1,
            );
        } else pendingReferenceLabel = false;
        previousBlank = blank;
        offset = newline < 0 ? source.length : end + 1;
        lineNumber++;
    }
    return buildValidatedChunks(source, boundaries, referenceCandidates);
}
