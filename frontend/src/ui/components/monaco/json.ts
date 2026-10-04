import type { languages } from 'monaco-editor';

export const language: languages.IMonarchLanguage = {
    tokenPostfix: '.json',
    tokenizer: {
        root: [
            [/\s+/, 'white'],
            [/"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"(?=\s*:)/, 'attribute.name'],
            [/"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/, 'string'],
            [/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
            [/\b(?:true|false|null)\b/, 'keyword'],
            [/[{}:,]|\[|\]/, 'delimiter'],
        ],
    },
};
