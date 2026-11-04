import type { Root } from 'mdast';

import { applyEdits } from './edits';
import { parseFull } from './parser';
import type { TextEdit, TidyOutcome } from './protocol';

type TreeValue = string | number | boolean | null | TreeValue[] | { [key: string]: TreeValue };

function isTextNode(value: TreeValue | undefined): value is { [key: string]: TreeValue; value: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        value.type === 'text' &&
        typeof value.value === 'string'
    );
}

function normalizeArray(value: unknown[]): TreeValue[] {
    const merged: TreeValue[] = [];
    for (const child of value.map(normalize)) {
        const previous = merged.at(-1);
        if (isTextNode(child) && isTextNode(previous)) previous.value += child.value;
        else merged.push(child);
    }
    return merged;
}

function normalize(value: unknown): TreeValue {
    if (Array.isArray(value)) return normalizeArray(value);
    if (typeof value === 'object' && value !== null) {
        const result: { [key: string]: TreeValue } = {};
        for (const [key, item] of Object.entries(value)) {
            if (key !== 'position' && item !== undefined) result[key] = normalize(item);
        }
        return result;
    }
    return value as TreeValue;
}

export function guardEdits(source: string, edits: TextEdit[], original = parseFull(source)): TidyOutcome {
    if (edits.length === 0) return { kind: 'edits', edits };
    const changed = applyEdits(source, edits);
    const candidate: Root = parseFull(changed);
    return JSON.stringify(normalize(original)) === JSON.stringify(normalize(candidate))
        ? { kind: 'edits', edits }
        : { kind: 'refused', reason: 'render-differs' };
}
