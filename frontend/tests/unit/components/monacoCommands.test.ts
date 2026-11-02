import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations';
import { CommandsRegistry } from 'monaco-editor/esm/vs/platform/commands/common/commands';

const registry = CommandsRegistry as { getCommand(id: string): { id: string } | undefined };

test('Monaco word and line contributions register their commands', () => {
    expect(registry.getCommand('cursorWordRight')).toBeDefined();
    expect(registry.getCommand('deleteWordLeft')).toBeDefined();
    expect(registry.getCommand('editor.action.moveLinesUpAction')).toBeDefined();
    expect(registry.getCommand('editor.action.copyLinesDownAction')).toBeDefined();
});
