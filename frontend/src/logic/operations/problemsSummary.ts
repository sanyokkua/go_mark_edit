import type { LintFinding } from '../tidy/protocol';

export interface ProblemsSummary {
    findings: LintFinding[];
    total: number;
    stale: boolean;
}

const listeners = new Set<() => void>();
let active: { documentId: string; text: string; summary: ProblemsSummary } | null = null;
let snapshot: ProblemsSummary | null = null;

function publish(next: ProblemsSummary | null): void {
    snapshot = next;
    for (const listener of [...listeners]) listener();
}

export function getSnapshot(): ProblemsSummary | null {
    return snapshot;
}

export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return (): void => {
        listeners.delete(listener);
    };
}

export function replace(documentId: string, findings: LintFinding[], total: number, text: string): void {
    const summary = { findings, total, stale: false };
    active = { documentId, text, summary };
    publish(summary);
}

export function markStale(documentId: string, text: string): void {
    if (active === null || active.documentId !== documentId || active.summary.stale || active.text === text) return;
    const summary = { ...active.summary, stale: true };
    active = { ...active, summary };
    publish(summary);
}

export function clear(): void {
    if (active === null && snapshot === null) return;
    active = null;
    publish(null);
}
