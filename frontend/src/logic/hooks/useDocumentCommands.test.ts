import type {
  EditorRange,
  EditorSelection,
} from '../../ui/components/CodeEditor';
import { createDocumentCommands } from './useDocumentCommands';

it('STORY-019-AC-5 exposes editor changes through the document-command seam', () => {
  const selection: EditorSelection = {
    start: { lineNumber: 1, column: 2 },
    end: { lineNumber: 1, column: 4 },
  };
  const replaceRange = jest.fn<void, [EditorRange, string]>();
  const replaceAll = jest.fn<void, [string]>();
  const editorRef = {
    current: {
      getSelection: (): EditorSelection => selection,
      replaceRange,
      replaceAll,
    },
  };
  const commands = createDocumentCommands(editorRef);
  const range: EditorRange = {
    start: { lineNumber: 2, column: 1 },
    end: { lineNumber: 2, column: 4 },
  };

  expect(commands.getSelection()).toEqual(selection);
  commands.replaceRange(range, 'new');
  commands.replaceAll('whole document');

  expect(replaceRange).toHaveBeenCalledWith(range, 'new');
  expect(replaceAll).toHaveBeenCalledWith('whole document');
});
