import type { languages } from 'monaco-editor';

/** Source colours only; Mermaid directives are comments, never editor commands. */
export const language: languages.IMonarchLanguage = {
    tokenPostfix: '.mermaid',
    tokenizer: {
        root: [
            [/%%.*$/, 'comment'],
            [/"(?:\\.|[^"\\])*"/, 'string'],
            [/(?:-->>|-\.->|-->|---|==>|->>|-{2}x|-{2}o|==x|==o|--|->)(?:\|[^|\r\n]*\|)?/, 'operator'],
            [
                /\b(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|gitGraph|journey|quadrantChart)\b/,
                'keyword',
            ],
            [
                /\b(?:subgraph|end|participant|actor|loop|alt|opt|par|note|section|class|state|direction)\b/,
                'keyword.control',
            ],
        ],
    },
};
