import {
  createDocumentConflictAdapter,
  createDocumentLifecycleAdapter,
  createDocumentWriteAdapter,
  createSettingsAdapter,
  type DocumentLifecycleBindings,
  type DocumentConflictBindings,
  type DocumentWriteBindings,
  type SettingsBindings,
} from './services';

// Proves: FR-WS-015
it('acknowledges ResetAppearance through one guarded zero-arity typed binding', async () => {
  const resetAppearance = jest.fn(async () => ({}));
  const bindings: SettingsBindings = {
    getSettings: jest.fn(),
    resetAppearance,
    updateAppearance: jest.fn(),
    updateContentPrivacy: jest.fn(),
    updateMarkdown: jest.fn(),
    updateEditor: jest.fn(),
    updateFile: jest.fn(),
  };
  const adapter = createSettingsAdapter(bindings);

  await expect(adapter.resetAppearance()).resolves.toBeUndefined();
  expect(resetAppearance).toHaveBeenCalledTimes(1);
  expect(resetAppearance).toHaveBeenCalledWith();
});

it('T009 preserves classified New/Open outcomes through guarded lifecycle bindings', async () => {
  const bindings: DocumentLifecycleBindings = {
    newDocument: jest.fn(async (expectedTabSetRevision: number) => {
      void expectedTabSetRevision;
      return { data: { documentId: 'new-doc', content: '' } };
    }),
    openDocument: jest.fn(async (expectedTabSetRevision: number) => {
      void expectedTabSetRevision;
      return { status: 'cancelled' as const };
    }),
  };
  const adapter = createDocumentLifecycleAdapter(bindings);

  await expect(adapter.newDocument(7)).resolves.toEqual({
    data: { documentId: 'new-doc', content: '' },
  });
  await expect(adapter.openDocument(7)).resolves.toEqual({
    status: 'cancelled',
  });
  expect(bindings.newDocument).toHaveBeenCalledWith(7);
  expect(bindings.openDocument).toHaveBeenCalledWith(7);
});

it('T015 guards Save and Save As with their exact three-argument bridge shapes', async () => {
  const bindings: DocumentWriteBindings = {
    save: jest.fn(
      async (
        documentId: string,
        contentRevision: number,
        decisionToken: string,
      ) => {
        void documentId;
        void contentRevision;
        void decisionToken;
        return { status: 'cancelled' as const };
      },
    ),
    saveAs: jest.fn(
      async (
        documentId: string,
        contentRevision: number,
        decisionToken: string,
      ) => {
        void documentId;
        void contentRevision;
        void decisionToken;
        return { status: 'cancelled' as const };
      },
    ),
  };
  const adapter = createDocumentWriteAdapter(bindings);

  await expect(adapter.save('doc-1', 8, '')).resolves.toEqual({
    status: 'cancelled',
  });
  await expect(adapter.saveAs('doc-1', 8, 'decision-1')).resolves.toEqual({
    status: 'cancelled',
  });
  expect(bindings.save).toHaveBeenCalledWith('doc-1', 8, '');
  expect(bindings.saveAs).toHaveBeenCalledWith('doc-1', 8, 'decision-1');
});

it('T020 guards every conflict decision with its exact bridge argument order', async () => {
  const version = {
    exists: true,
    mode: 0o644,
    modifiedUnixNano: '9',
    size: 12,
  };
  const bindings: DocumentConflictBindings = {
    authorizeKeepMine: jest.fn(
      async (documentId, contentRevision, path, detectedVersion) => {
        void documentId;
        void contentRevision;
        void path;
        void detectedVersion;
        return { status: 'authorized' as const };
      },
    ),
    cancelConflict: jest.fn(async (documentId, contentRevision, version) => {
      void documentId;
      void contentRevision;
      void version;
      return { status: 'cancelled' as const };
    }),
    checkExternalChanges: jest.fn(async (documentId) => {
      void documentId;
      return { status: 'unchanged' as const };
    }),
    reloadFromDisk: jest.fn(async (documentId, contentRevision, version) => {
      void documentId;
      void contentRevision;
      void version;
      return { status: 'reloaded' as const };
    }),
    skipConflict: jest.fn(async (documentId, contentRevision, version) => {
      void documentId;
      void contentRevision;
      void version;
      return { status: 'skipped' as const };
    }),
  };
  const adapter = createDocumentConflictAdapter(bindings);

  await expect(adapter.checkExternalChanges('doc-1')).resolves.toEqual({
    status: 'unchanged',
  });
  await expect(adapter.reloadFromDisk('doc-1', 4, version)).resolves.toEqual({
    status: 'reloaded',
  });
  await expect(
    adapter.authorizeKeepMine('doc-1', 4, '/repo/doc-1.md', version),
  ).resolves.toEqual({ status: 'authorized' });
  await expect(adapter.skipConflict('doc-1', 4, version)).resolves.toEqual({
    status: 'skipped',
  });
  await expect(adapter.cancelConflict('doc-1', 4, version)).resolves.toEqual({
    status: 'cancelled',
  });

  expect(bindings.checkExternalChanges).toHaveBeenCalledWith('doc-1');
  expect(bindings.reloadFromDisk).toHaveBeenCalledWith('doc-1', 4, version);
  expect(bindings.authorizeKeepMine).toHaveBeenCalledWith(
    'doc-1',
    4,
    '/repo/doc-1.md',
    version,
  );
  expect(bindings.skipConflict).toHaveBeenCalledWith('doc-1', 4, version);
  expect(bindings.cancelConflict).toHaveBeenCalledWith('doc-1', 4, version);
});
