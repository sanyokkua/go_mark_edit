import type { languages } from 'monaco-editor';

export const language: languages.IMonarchLanguage = {
    tokenPostfix: '.makefile',
    tokenizer: {
        root: [
            [/^\s*#.*$/, 'comment'],
            [/^[A-Za-z_][\w.-]*(?=\s*(?::?=|\?=|\+=))/, 'variable'],
            [/^[^\s:#=]+(?=\s*:)/, 'type'],
            [/\$\((?:[^()]|\([^()]*\))*\)|\$\{[^}]*\}|\$[@<^?*]/, 'variable'],
            [/^\t.*$/, 'string'],
            [/#.*$/, 'comment'],
        ],
    },
};
