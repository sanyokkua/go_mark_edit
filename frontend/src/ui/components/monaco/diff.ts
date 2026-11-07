import type { languages } from 'monaco-editor';

export const language: languages.IMonarchLanguage = {
    tokenPostfix: '.diff',
    tokenizer: {
        root: [
            [/^(?:diff\b|index\b|---\s|\+\+\+\s).*$/, 'keyword'],
            [/^(?=(@@.*@@))\1.*$/, 'number'],
            [/^\+.*$/, 'string'],
            [/^-.*$/, 'comment'],
        ],
    },
};
