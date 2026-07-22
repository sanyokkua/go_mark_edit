import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';

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

it('STORY-023-AC-3 returns the current selection or null', () => {
  const selection: EditorSelection = {
    start: { lineNumber: 3, column: 2 },
    end: { lineNumber: 3, column: 8 },
  };
  let editor: {
    getSelection: () => EditorSelection;
    replaceRange: jest.Mock<void, [EditorRange, string]>;
    replaceAll: jest.Mock<void, [string]>;
  } | null = {
    getSelection: (): EditorSelection => selection,
    replaceRange: jest.fn<void, [EditorRange, string]>(),
    replaceAll: jest.fn<void, [string]>(),
  };
  const commands = createDocumentCommands(() => editor);

  expect(commands.getSelection()).toEqual(selection);

  editor = null;

  expect(commands.getSelection()).toBeNull();
  expect((): void => {
    commands.replaceRange(
      {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 1 },
      },
      'ignored',
    );
    commands.replaceAll('ignored');
  }).not.toThrow();
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return /(?<!\.test)\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function sourceFile(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function moduleName(expression: ts.Expression | undefined): string | null {
  return expression !== undefined && ts.isStringLiteral(expression)
    ? expression.text
    : null;
}

function isMonacoModule(name: string | null): boolean {
  return (
    name === 'monaco-editor' ||
    name?.startsWith('monaco-editor/') === true ||
    name === '@monaco-editor/react' ||
    name?.startsWith('@monaco-editor/react/') === true
  );
}

function hasIdentifier(source: ts.SourceFile, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return found;
}

function hasMonacoModuleLoad(source: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      isMonacoModule(moduleName(node.moduleSpecifier))
    ) {
      found = true;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      isMonacoModule(moduleName(node.moduleReference.expression))
    ) {
      found = true;
    }
    if (ts.isCallExpression(node)) {
      const loadedModule = moduleName(node.arguments[0]);
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isDynamicImport || isRequire) && isMonacoModule(loadedModule)) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return found;
}

function interfaceMembers(source: ts.SourceFile, name: string): string[] {
  let members: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      members = node.members.flatMap((member): string[] =>
        member.name === undefined ? [] : [member.name.getText(source)],
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return members;
}

it('STORY-023-AC-5 enforces the direct-Monaco ownership boundary', () => {
  const sourceRoot = resolve(process.cwd(), 'src');
  const sources = sourceFiles(sourceRoot).map((path) => ({
    path: relative(process.cwd(), path),
    source: sourceFile(path),
  }));
  const directMonacoImports = sources
    .filter(({ source }) => hasMonacoModuleLoad(source))
    .map(({ path }) => path)
    .sort();
  const editorInstanceAccess = sources
    .filter(({ source }) => hasIdentifier(source, 'IStandaloneCodeEditor'))
    .map(({ path }) => path);
  const handleOwnership = sources
    .filter(({ source }) => hasIdentifier(source, 'CodeEditorHandle'))
    .map(({ path }) => path)
    .sort();

  expect(directMonacoImports).toEqual([
    'src/ui/components/CodeEditor.tsx',
    'src/ui/components/monacoSetup.ts',
  ]);
  expect(editorInstanceAccess).toEqual(['src/ui/components/CodeEditor.tsx']);
  expect(handleOwnership).toEqual([
    'src/logic/hooks/useDocumentCommands.ts',
    'src/ui/components/CodeEditor.tsx',
    'src/ui/widgets/editorSession.ts',
  ]);

  const commandSource = sourceFile(
    resolve(sourceRoot, 'logic/hooks/useDocumentCommands.ts'),
  );
  const activeBufferSource = sourceFile(
    resolve(sourceRoot, 'logic/store/appModelTypes.ts'),
  );
  expect(interfaceMembers(commandSource, 'DocumentCommandAPI')).toEqual([
    'getSelection',
    'replaceRange',
    'replaceAll',
  ]);
  expect(interfaceMembers(activeBufferSource, 'ActiveBuffer')).toContain(
    'content',
  );
});
