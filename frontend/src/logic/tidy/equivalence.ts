import type { Root } from 'mdast';

import { applyEdits } from './edits';
import { parseFull } from './parser';
import type { TextEdit, TidyOutcome } from './protocol';

type TreeValue = string | number | boolean | null | TreeValue[] | { [key: string]: TreeValue };

function normalize(value: unknown): TreeValue {
    if (Array.isArray(value)) {
        const children = value.map(normalize);
        const merged: TreeValue[] = [];
        for (const child of children) {
            const previous = merged.at(-1);
            if (
                typeof child === 'object' &&
                child !== null &&
                !Array.isArray(child) &&
                child.type === 'text' &&
                typeof previous === 'object' &&
                previous !== null &&
                !Array.isArray(previous) &&
                previous.type === 'text' &&
                typeof previous.value === 'string' &&
                typeof child.value === 'string'
            ) {
                previous.value += child.value;
            } else merged.push(child);
        }
        return merged;
    }
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
