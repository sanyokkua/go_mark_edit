import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';

import type {
  CodeEditorHandle,
  EditorRange,
  EditorSelection,
} from '../../ui/components/CodeEditor';
import {
  createDocumentCommands,
  type DocumentCommandSession,
} from './useDocumentCommands';

function createHandle(
  overrides: Partial<CodeEditorHandle> = {},
): CodeEditorHandle {
  return {
    getContent: (): string | null => 'working copy',
    getSelection: (): EditorSelection | null => null,
    replaceAll: (): boolean => true,
    replaceRange: (): boolean => true,
    ...overrides,
  };
}

function createSession(
  documentId: string,
  handle: CodeEditorHandle,
  token = Symbol('editor-session'),
): DocumentCommandSession {
  return { documentId, handle, token };
}

it('STORY-019-AC-5 exposes editor changes through the document-command seam', () => {
  const selection: EditorSelection = {
    start: { lineNumber: 1, column: 2 },
    end: { lineNumber: 1, column: 4 },
  };
  const replaceRange = jest.fn<boolean, [EditorRange, string]>(() => true);
  const replaceAll = jest.fn<boolean, [string]>(() => true);
  const session = createSession(
    'document-1',
    createHandle({
      getSelection: (): EditorSelection => selection,
      replaceRange,
      replaceAll,
    }),
  );
  const commands = createDocumentCommands(
    session.documentId,
    session.token,
    (): DocumentCommandSession => session,
  );
  const range: EditorRange = {
    start: { lineNumber: 2, column: 1 },
    end: { lineNumber: 2, column: 4 },
  };

  expect(commands.getSelection()).toEqual({
    status: 'available',
    value: selection,
  });
  expect(commands.replaceRange(range, 'new')).toEqual({
    status: 'available',
    value: undefined,
  });
  expect(commands.replaceAll('whole document')).toEqual({
    status: 'available',
    value: undefined,
  });

  expect(replaceRange).toHaveBeenCalledWith(range, 'new');
  expect(replaceAll).toHaveBeenCalledWith('whole document');
});

it('STORY-023-AC-3 returns the current selection or null', () => {
  const selection: EditorSelection = {
    start: { lineNumber: 3, column: 2 },
    end: { lineNumber: 3, column: 8 },
  };
  const session = createSession(
    'document-1',
    createHandle({ getSelection: (): EditorSelection => selection }),
  );
  let liveSession: DocumentCommandSession | null = session;
  const commands = createDocumentCommands(
    session.documentId,
    session.token,
    (): DocumentCommandSession | null => liveSession,
  );

  expect(commands.getSelection()).toEqual({
    status: 'available',
    value: selection,
  });

  liveSession = null;

  expect(commands.getSelection()).toEqual({ status: 'unavailable' });
  expect(
    commands.replaceRange(
      {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 1 },
      },
      'ignored',
    ),
  ).toEqual({ status: 'unavailable' });
  expect(commands.replaceAll('ignored')).toEqual({ status: 'unavailable' });
});

it('STORY-030-AC-2 returns unavailable when no session handle exists', () => {
  const commands = createDocumentCommands(
    'document-1',
    Symbol('expected'),
    () => null,
  );
  const range: EditorRange = {
    start: { lineNumber: 1, column: 1 },
    end: { lineNumber: 1, column: 1 },
  };

  expect(commands.getContent()).toEqual({ status: 'unavailable' });
  expect(commands.getSelection()).toEqual({ status: 'unavailable' });
  expect(commands.replaceRange(range, 'ignored')).toEqual({
    status: 'unavailable',
  });
  expect(commands.replaceAll('ignored')).toEqual({ status: 'unavailable' });
});

it('STORY-030-AC-5 discriminates detached unavailable and stale mismatch', () => {
  const handle = createHandle();
  const original = createSession('document-1', handle);
  let liveSession: DocumentCommandSession | null = original;
  const commands = createDocumentCommands(
    original.documentId,
    original.token,
    () => liveSession,
  );

  liveSession = null;
  expect(commands.getContent()).toEqual({ status: 'unavailable' });

  const replacement = createSession('document-1', createHandle());
  liveSession = replacement;
  expect(commands.getContent()).toEqual({ status: 'document-mismatch' });
  expect(commands.replaceAll('ignored')).toEqual({
    status: 'document-mismatch',
  });
});

it('STORY-030-AC-5 returns unavailable without touching an unavailable Monaco model', () => {
  const getSelection = jest.fn<EditorSelection | null, []>(() => null);
  const replaceRange = jest.fn<boolean, [EditorRange, string]>(() => false);
  const replaceAll = jest.fn<boolean, [string]>(() => false);
  const session = createSession(
    'document-1',
    createHandle({
      getContent: (): null => null,
      getSelection,
      replaceRange,
      replaceAll,
    }),
  );
  const commands = createDocumentCommands(
    session.documentId,
    session.token,
    (): DocumentCommandSession => session,
  );

  expect(commands.getContent()).toEqual({ status: 'unavailable' });
  expect(commands.getSelection()).toEqual({ status: 'unavailable' });
  expect(getSelection).not.toHaveBeenCalled();
  expect(
    commands.replaceRange(
      {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 1 },
      },
      'ignored',
    ),
  ).toEqual({ status: 'unavailable' });
  expect(commands.replaceAll('ignored')).toEqual({ status: 'unavailable' });
  expect(replaceRange).toHaveBeenCalledTimes(1);
  expect(replaceAll).toHaveBeenCalledTimes(1);
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

it('STORY-023-AC-5 continues to enforce the direct-Monaco ownership boundary', () => {
  const commandSource = sourceFile(
    resolve(process.cwd(), 'src/logic/hooks/useDocumentCommands.ts'),
  );

  expect(hasMonacoModuleLoad(commandSource)).toBe(false);
  expect(interfaceMembers(commandSource, 'DocumentCommandAPI')).toContain(
    'getSelection',
  );
});

it('STORY-030-AC-6 keeps sibling consumers independent of Monaco', () => {
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
    'getContent',
    'getSelection',
    'replaceRange',
    'replaceAll',
  ]);
  expect(interfaceMembers(activeBufferSource, 'ActiveBuffer')).toContain(
    'content',
  );
});
