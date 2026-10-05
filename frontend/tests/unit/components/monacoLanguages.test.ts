import type { languages } from 'monaco-editor';

const register = jest.fn();
const registerTokensProviderFactory = jest.fn();
const setMonarchTokensProvider = jest.fn();
const onLanguageEncountered = jest.fn();
const loadJavascriptGrammar = jest.fn();

jest.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
    editor: { defineTheme: jest.fn(), setTheme: jest.fn() },
    languages: { register, registerTokensProviderFactory, setMonarchTokensProvider, onLanguageEncountered },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/_.contribution', () => ({
    registerLanguage: (definition: { id: string; loader(): Promise<{ language: languages.IMonarchLanguage }> }) => {
        register(definition);
        registerTokensProviderFactory(definition.id, { create: async () => (await definition.loader()).language });
    },
}));
jest.mock('monaco-editor/esm/vs/editor/browser/coreCommands', () => ({}));
jest.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution', () => ({}));
jest.mock('monaco-editor/esm/vs/editor/contrib/links/browser/links', () => ({}));
jest.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => jest.fn(), { virtual: true });
jest.mock('../../../src/logic/markdown/runEditorLinkExtraction', () => ({ runEditorLinkExtraction: jest.fn() }));
jest.mock('monaco-editor/esm/vs/basic-languages/javascript/javascript', () => ({
    ...loadJavascriptGrammar(),
    language: { tokenPostfix: '.js', tokenizer: { root: [] } },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/typescript/typescript', () => ({
    language: { tokenPostfix: '.ts', tokenizer: { root: [] } },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/shell/shell', () => ({
    language: { tokenPostfix: '.shell', tokenizer: { root: [] } },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/markdown/markdown', () => ({
    language: { tokenPostfix: '.md', tokenizer: { root: [] } },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/csharp/csharp', () => ({
    language: { tokenPostfix: '.cs', tokenizer: { root: [] } },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/rust/rust', () => ({
    language: { tokenPostfix: '.rust', tokenizer: { root: [] } },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/kotlin/kotlin', () => ({
    language: { tokenPostfix: '.kt', tokenizer: { root: [] } },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile', () => ({
    language: { tokenPostfix: '.dockerfile', tokenizer: { root: [] } },
}));
jest.mock('monaco-editor/esm/vs/basic-languages/ini/ini', () => ({
    language: { tokenPostfix: '.ini', tokenizer: { root: [] } },
}));

const builtins = [
    'javascript',
    'typescript',
    'go',
    'python',
    'java',
    'c',
    'cpp',
    'csharp',
    'rust',
    'ruby',
    'php',
    'kotlin',
    'swift',
    'sql',
    'yaml',
    'xml',
    'html',
    'css',
    'scss',
    'powershell',
    'dockerfile',
    'shell',
    'markdown',
    'ini',
];
const aliases = [
    'jsx',
    'tsx',
    'bash',
    'zsh',
    'console',
    'md',
    'cs',
    'rs',
    'kt',
    'docker',
    'patch',
    'make',
    'mk',
    'toml',
];
const custom = ['json', 'diff', 'makefile', 'mermaid'];

function firstMatch(language: languages.IMonarchLanguage, input: string): { token: unknown; text: string } | undefined {
    for (const rule of language.tokenizer.root) {
        if (!Array.isArray(rule) || !(rule[0] instanceof RegExp)) continue;
        const match = rule[0].exec(input);
        if (match?.index === 0) return { token: rule[1], text: match[0] };
    }
    return undefined;
}

function firstToken(language: languages.IMonarchLanguage, input: string): unknown {
    return firstMatch(language, input)?.token;
}

test('loading Monaco setup registers each fenced language id with its tokenizer', async () => {
    expect(register).not.toHaveBeenCalled();
    await import('../../../src/ui/components/monacoSetup');
    const ids = register.mock.calls.map(([definition]: [languages.ILanguageExtensionPoint]) => definition.id);
    expect(ids.sort()).toEqual([...builtins, ...aliases, ...custom].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(loadJavascriptGrammar).not.toHaveBeenCalled();
    const factories = new Map<string, languages.TokensProviderFactory>(registerTokensProviderFactory.mock.calls);
    const expected = new Map([
        ['jsx', '.js'],
        ['tsx', '.ts'],
        ['bash', '.shell'],
        ['zsh', '.shell'],
        ['console', '.shell'],
        ['md', '.md'],
        ['cs', '.cs'],
        ['rs', '.rust'],
        ['kt', '.kt'],
        ['docker', '.dockerfile'],
        ['toml', '.ini'],
    ]);
    for (const [alias, postfix] of expected) {
        const grammar = await factories.get(alias)?.create();
        expect(grammar).toEqual(expect.objectContaining({ tokenPostfix: postfix, tokenizer: expect.any(Object) }));
    }
    expect(loadJavascriptGrammar).toHaveBeenCalledTimes(1);
    for (const alias of aliases)
        expect(factories.has(alias) || setMonarchTokensProvider.mock.calls.some(([id]) => id === alias)).toBe(true);
    const definitions = new Map<string, languages.IMonarchLanguage>(setMonarchTokensProvider.mock.calls);
    for (const id of custom) {
        expect(definitions.get(id)).toEqual(
            expect.objectContaining({ tokenizer: expect.objectContaining({ root: expect.any(Array) }) }),
        );
        expect(definitions.get(id)?.tokenizer.root.length).toBeGreaterThan(0);
    }
    expect(definitions.get('patch')).toBe(definitions.get('diff'));
    expect(definitions.get('make')).toBe(definitions.get('makefile'));
    expect(definitions.get('mk')).toBe(definitions.get('makefile'));

    const json = definitions.get('json')!;
    expect(firstToken(json, '"name":')).toBe('attribute.name');
    expect(firstToken(json, '"value"')).toBe('string');
    expect(firstToken(json, '12.5')).toBe('number');
    expect(firstToken(json, 'true')).toBe('keyword');
    expect(firstToken(json, 'null')).toBe('keyword');
    expect(firstToken(json, '{')).toBe('delimiter');

    const diff = definitions.get('diff')!;
    expect(firstToken(diff, 'diff --git a/a b/a')).toBe('keyword');
    expect(firstToken(diff, '--- a/a')).toBe('keyword');
    expect(firstToken(diff, '@@ -1 +1 @@')).toBe('number');
    expect(firstToken(diff, '+added')).toBe('string');
    expect(firstToken(diff, '-removed')).toBe('comment');

    const makefile = definitions.get('makefile')!;
    for (const assignment of ['OUTPUT := build', 'OUTPUT = build', 'OUTPUT ?= build', 'OUTPUT += build']) {
        expect(firstToken(makefile, assignment)).toBe('variable');
    }
    expect(firstToken(makefile, 'build: source')).toBe('type');
    expect(firstToken(makefile, '# comment')).toBe('comment');
    expect(firstToken(makefile, '\t@echo build')).toBe('string');

    const mermaid = definitions.get('mermaid')!;
    expect(mermaid.tokenPostfix).toBe('.mermaid');
    for (const diagram of ['flowchart', 'sequenceDiagram', 'stateDiagram-v2', 'gitGraph', 'quadrantChart']) {
        expect(firstToken(mermaid, diagram)).toBe('keyword');
    }
    for (const structure of ['subgraph', 'participant', 'direction', 'section', 'end']) {
        expect(firstToken(mermaid, structure)).toBe('keyword.control');
    }
    for (const arrow of ['-->', '---', '==>', '-.->', '->>', '-->>', '--x', '-->|label|']) {
        expect(firstToken(mermaid, arrow)).toBe('operator');
    }
    expect(firstToken(mermaid, '-x->')).toBeUndefined();
    expect(firstToken(mermaid, '"a \\"quoted\\" label"')).toBe('string');
    expect(firstToken(mermaid, '%% comment -->')).toBe('comment');
    expect(firstToken(mermaid, '%%{init: {"theme": "dark"}}%%')).toBe('comment');
    for (const input of [
        'stateDiagram-v2',
        'sequenceDiagram',
        '-->>',
        '-.->',
        '-->|label|',
        String.raw`"a \"quoted\" label"`,
        '%%{init: {"theme": "dark", "edge": "-->"}}%%',
    ]) {
        expect(firstMatch(mermaid, input)?.text).toBe(input);
    }
});
