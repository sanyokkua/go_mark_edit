import { CommandsRegistry } from 'monaco-editor/esm/vs/platform/commands/common/commands';

jest.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => jest.fn(), { virtual: true });
// Language grammars are irrelevant here and their registry does not load under jest.
jest.mock('monaco-editor/esm/vs/basic-languages/_.contribution', () => ({ registerLanguage: jest.fn() }));
jest.mock('../../../src/logic/markdown/runEditorLinkExtraction', () => ({ runEditorLinkExtraction: jest.fn() }));

// jsdom has no matchMedia, which Monaco's standalone theme service reads on creation.
Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }),
});

const registry = CommandsRegistry as { getCommand(id: string): { id: string } | undefined };

test('monacoSetup registers the word and line editing commands', async () => {
    const commands = [
        'cursorWordRight',
        'deleteWordLeft',
        'editor.action.moveLinesUpAction',
        'editor.action.copyLinesDownAction',
    ];
    expect(commands.filter((id) => registry.getCommand(id) !== undefined)).toEqual([]);

    await import('../../../src/ui/components/monacoSetup');

    expect(commands.filter((id) => registry.getCommand(id) === undefined)).toEqual([]);
});
