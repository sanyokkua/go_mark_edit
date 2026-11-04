import type { languages } from 'monaco-editor';

const substitution = /\$\((?:[^()]|\([^()]*\))*\)|\$\{[^}]*\}|\$[@<^?*]/;

export const language: languages.IMonarchLanguage = {
    tokenPostfix: '.makefile',
    tokenizer: {
        root: [
            [/^\s*#.*$/, 'comment'],
            [/^[A-Za-z_][\w.-]*(?=\s*(?::?=|\?=|\+=))/, 'variable'],
            [/^[^\s:#=]+(?=\s*:)/, 'type'],
            [substitution, 'variable'],
            [/^\t.*$/, 'string'],
            // Group the anchor so Monarch also tries this rule at inline offsets.
            [/(?:^#.*$)/, 'comment'],
            // A failed comment has a separator ahead. Skip further attempts until it is consumed.
            [/#/, { token: 'source', switchTo: '@beforeSeparator' }],
        ],
        beforeSeparator: [
            [
                substitution,
                {
                    cases: {
                        '$0~[^\\r\\n\\u2028\\u2029]*': 'variable',
                        '@default': { token: 'variable', switchTo: '@root' },
                    },
                },
            ],
            [/[\r\n\u2028\u2029]/, { token: 'source', switchTo: '@root' }],
        ],
    },
};
