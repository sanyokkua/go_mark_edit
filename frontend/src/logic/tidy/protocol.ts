import type { TidyPreferences } from './prefs';

export type TidyOp = 'format' | 'compact' | 'lint';

export interface TidyRequest {
    op: TidyOp;
    text: string;
    prefs: TidyPreferences;
}

export interface TextEdit {
    from: number;
    to: number;
    text: string;
}

export type LintRule =
    | 'ul-marker'
    | 'emphasis-marker'
    | 'strong-marker'
    | 'heading-style'
    | 'list-indent'
    | 'single-h1'
    | 'trailing-space'
    | 'blank-lines'
    | 'fence-language'
    | 'final-newline';

export interface LintFinding {
    rule: LintRule;
    severity: 'error' | 'warning';
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    message: { key: string; args?: Record<string, string | number> };
    hint: string;
}

export type TidyOutcome =
    | { kind: 'edits'; edits: TextEdit[] }
    | { kind: 'findings'; findings: LintFinding[]; total: number }
    | { kind: 'refused'; reason: 'render-differs' }
    | { kind: 'cancelled' }
    | { kind: 'failed' }
    | { kind: 'stale' };

export type WorkerOutcome = Extract<TidyOutcome, { kind: 'edits' | 'findings' | 'refused' | 'failed' }>;

export interface WorkerRequest extends TidyRequest {
    id: number;
}

export type WorkerReply =
    | { id: number; type: 'progress'; done: number; total: number }
    | { id: number; type: 'result'; outcome: WorkerOutcome };
