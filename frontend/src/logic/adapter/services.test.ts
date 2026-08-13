import {
  createClosePlanAdapter,
  createDocumentConflictAdapter,
  createDocumentLifecycleAdapter,
  createDocumentWriteAdapter,
  createSettingsAdapter,
  type DocumentLifecycleBindings,
  type DocumentConflictBindings,
  type DocumentWriteBindings,
  type ClosePlanBindings,
  type SettingsBindings,
} from './services';
import type { ClosePlanKind, ClosePlanResult } from '../store/appModelTypes';

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

it('ClosePlan complete-plan bridge preserves choices and exact arity', async () => {
  const prepareClose: ClosePlanBindings['prepareClose'] = jest.fn(
    async (
      kind: ClosePlanKind,
      ids: string[],
      revision: number,
    ): Promise<ClosePlanResult> => {
      expect(kind).toBe('right');
      expect(ids).toEqual(['doc-1', 'doc-2']);
      expect(revision).toBe(12);
      return {
        data: {
          id: 'plan-1',
          kind: 'right',
          status: 'collecting',
          tabSetRevision: 12,
          targets: [
            {
              documentId: 'doc-1',
              title: 'one.md',
              contentRevision: 4,
              dirty: true,
            },
          ],
        },
      };
    },
  );
  const resolveClosePlan: ClosePlanBindings['resolveClosePlan'] = jest.fn(
    async (
      planId: string,
      decisions: Parameters<ClosePlanBindings['resolveClosePlan']>[1],
    ): Promise<ClosePlanResult> => {
      void planId;
      void decisions;
      return {
        data: {
          id: 'plan-1',
          kind: 'right',
          status: 'ready',
          tabSetRevision: 12,
          targets: [
            {
              documentId: 'doc-1',
              title: 'one.md',
              contentRevision: 4,
              dirty: true,
              choice: 'save',
              normalizationToken: 'ending-token',
            },
          ],
        },
      };
    },
  );
  const executeClosePlan: ClosePlanBindings['executeClosePlan'] = jest.fn(
    async (planId: string) => {
      expect(planId).toBe('plan-1');
      return { status: 'closed' as const, orderedDocumentIds: [] };
    },
  );
  const bindings: ClosePlanBindings = {
    prepareClose,
    resolveClosePlan,
    executeClosePlan,
  };
  const adapter = createClosePlanAdapter(bindings);

  await expect(
    adapter.prepareClose('right', ['doc-1', 'doc-2'], 12),
  ).resolves.toMatchObject({ data: { id: 'plan-1', kind: 'right' } });
  await expect(
    adapter.resolveClosePlan('plan-1', [
      {
        documentId: 'doc-1',
        choice: 'save',
        decisionToken: 'ending-token',
      },
    ]),
  ).resolves.toMatchObject({ data: { status: 'ready' } });
  await expect(adapter.executeClosePlan('plan-1')).resolves.toEqual({
    status: 'closed',
    orderedDocumentIds: [],
  });
  expect(prepareClose).toHaveBeenCalledWith('right', ['doc-1', 'doc-2'], 12);
  expect(resolveClosePlan).toHaveBeenCalledWith('plan-1', [
    {
      documentId: 'doc-1',
      choice: 'save',
      decisionToken: 'ending-token',
    },
  ]);
});

/*
 * Quitting with no documents open left the window impossible to close.
 *
 * `apperr.ClosePlanSummary.Targets` is tagged without `omitempty`, so a plan
 * with no targets arrives as `targets: null` — a value `ClosePlanSummary`
 * declares as `CloseTarget[]`. Normalising it threw
 * `TypeError: Cannot read properties of null (reading 'map')`, the native-close
 * handler caught that and cancelled the quit, and Wails had already vetoed the
 * native close. Every later attempt repeated it, so the process had to be
 * killed.
 */
it('FR-FT-034 tolerates a plan whose empty target list arrives as null', async () => {
  const prepareClose: ClosePlanBindings['prepareClose'] = jest.fn(
    async (
      kind: ClosePlanKind,
      ids: string[],
      revision: number,
    ): Promise<ClosePlanResult> => {
      void kind;
      void ids;
      void revision;
      return {
        data: {
          id: 'plan-empty',
          kind: 'quit',
          status: 'ready',
          tabSetRevision: 1,
          targets: null,
        },
      } as unknown as ClosePlanResult;
    },
  );
  const adapter = createClosePlanAdapter({
    prepareClose,
    resolveClosePlan: jest.fn(),
    executeClosePlan: jest.fn(),
  } as unknown as ClosePlanBindings);

  const prepared = await adapter.prepareClose('quit', [], 1);

  expect(prepared.data?.status).toBe('ready');
  expect(prepared.data?.targets).toEqual([]);
});
