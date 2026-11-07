import type { languages } from 'monaco-editor';

const quotedString = /"(?:\\.|[^"\\])*"/;
const arrow = /(?:-->>|-\.->|-->|---|==>|->>|-{2}x|-{2}o|==x|==o|--|->)(?:\|[^|\r\n]*\|)?/;
const keywords: languages.IMonarchLanguageRule[] = [
    [
        /\b(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|gitGraph|journey|quadrantChart)\b/,
        'keyword',
    ],
    [/\b(?:subgraph|end|participant|actor|loop|alt|opt|par|note|section|class|state|direction)\b/, 'keyword.control'],
];

function resumeCommentsAfterSeparator(token: string): languages.IMonarchLanguageAction {
    return {
        cases: {
            '$0~[^\\r\\n\\u2028\\u2029]*': token,
            '@default': { token, switchTo: '@root' },
        },
    };
}

/** Source colours only; Mermaid directives are comments, never editor commands. */
export const language: languages.IMonarchLanguage = {
    tokenPostfix: '.mermaid',
    tokenizer: {
        root: [
            // Group the anchor so Monarch also tries this rule at inline offsets.
            [/(?:^%%.*$)/, 'comment'],
            // A failed comment has a separator ahead. Skip further attempts until it is consumed.
            [/%%/, { token: 'source', switchTo: '@beforeSeparator' }],
            [quotedString, 'string'],
            [arrow, 'operator'],
            ...keywords,
        ],
        beforeSeparator: [
            [quotedString, resumeCommentsAfterSeparator('string')],
            [arrow, resumeCommentsAfterSeparator('operator')],
            ...keywords,
            [/[\r\n\u2028\u2029]/, { token: 'source', switchTo: '@root' }],
        ],
    },
};
