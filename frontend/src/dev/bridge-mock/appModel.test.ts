import {
  GetState,
  NewDocument,
  OpenDocument,
  Save,
  SaveAs,
  resetMockAppModel,
  setMockOpenSelection,
  SetDocView,
  SetUILayout,
  UpdateBuffer,
} from './go/appmodel/AppModelHandler';
import { EventsOn } from './runtime';

beforeEach(() => {
  resetMockAppModel();
});

it('STORY-012-AC-6 mirrors the app-model bridge contract', async () => {
  const initial = await GetState();
  expect(initial).toEqual({
    data: expect.objectContaining({
      snapshot: expect.objectContaining({
        revision: expect.any(Number),
        documents: expect.objectContaining({
          'mock-document': expect.not.objectContaining({
            content: expect.anything(),
          }),
        }),
      }),
      activeBuffer: {
        documentId: 'mock-document',
        documentRevision: 0,
        projectionRevision: 0,
        content: '',
      },
    }),
  });

  const patches: unknown[] = [];
  const unsubscribe = EventsOn('state:patch', (patch: unknown): void => {
    patches.push(patch);
  });

  await expect(UpdateBuffer('mock-document', 'one two')).resolves.toEqual({});
  await expect(
    SetDocView('mock-document', {
      editorVisible: false,
      previewVisible: true,
      cursor: { line: 2, column: 3 },
      selection: {
        start: { line: 2, column: 1 },
        end: { line: 2, column: 3 },
      },
      scroll: { editor: 4, preview: 5 },
    }),
  ).resolves.toEqual({});
  await expect(SetUILayout({ sidebarVisible: false })).resolves.toEqual({});
  await expect(UpdateBuffer('missing-document', 'ignored')).resolves.toEqual({
    error: {
      code: 'not_found',
      title: 'Document not found',
      message: 'The mock document does not exist.',
      retryable: false,
    },
  });
  unsubscribe();

  expect(patches).toEqual([
    expect.objectContaining({
      revision: expect.any(Number),
      documents: {
        upsert: {
          'mock-document': expect.objectContaining({
            dirty: true,
            wordCount: 2,
          }),
        },
      },
    }),
    expect.objectContaining({
      documents: {
        upsert: {
          'mock-document': expect.objectContaining({
            view: expect.objectContaining({
              arrangement: 'preview',
              editorVisible: false,
              previewVisible: true,
            }),
          }),
        },
      },
    }),
    expect.objectContaining({ ui: { sidebarVisible: false } }),
  ]);
  expect(JSON.stringify(patches)).not.toContain('one two');
});

it('accepts NewDocument at the current tab revision and emits one activation patch', async () => {
  const initial = await GetState();
  const patches: unknown[] = [];
  const unsubscribe = EventsOn('state:patch', (patch: unknown): void => {
    patches.push(patch);
  });

  await expect(
    NewDocument(initial.data!.snapshot.tabSetRevision),
  ).resolves.toEqual({
    data: {
      documentId: 'mock-document-2',
      documentRevision: 0,
      projectionRevision: 1,
      content: '',
    },
  });
  unsubscribe();

  const state = await GetState();
  expect(state.data!.snapshot.orderedDocumentIds).toEqual([
    'mock-document',
    'mock-document-2',
  ]);
  expect(state.data!.snapshot.activeDocumentId).toBe('mock-document-2');
  expect(patches).toEqual([
    expect.objectContaining({
      revision: 1,
      tabSetRevision: 1,
      orderedDocumentIds: ['mock-document', 'mock-document-2'],
      activeDocumentId: 'mock-document-2',
      documents: {
        upsert: {
          'mock-document-2': expect.objectContaining({
            title: 'Untitled 2',
            dirty: false,
          }),
        },
      },
    }),
  ]);
});

it('rejects stale NewDocument without mutating state', async () => {
  const initial = await GetState();

  await expect(
    NewDocument(initial.data!.snapshot.tabSetRevision + 1),
  ).resolves.toEqual({
    error: expect.objectContaining({
      category: 'conflict',
      remediation: 'Retry',
    }),
  });
  await expect(GetState()).resolves.toEqual(initial);
});

it('returns OpenDocument cancellation without a patch or state mutation', async () => {
  const initial = await GetState();
  const patches: unknown[] = [];
  const unsubscribe = EventsOn('state:patch', (patch: unknown): void => {
    patches.push(patch);
  });

  await expect(
    OpenDocument(initial.data!.snapshot.tabSetRevision),
  ).resolves.toEqual({
    status: 'cancelled',
  });
  unsubscribe();

  expect(patches).toEqual([]);
  await expect(GetState()).resolves.toEqual(initial);
});

it('opens the selected mock path and returns its active-buffer acknowledgement', async () => {
  setMockOpenSelection({ path: '/tmp/selected.md', content: '# selected' });
  const initial = await GetState();
  const patches: unknown[] = [];
  const unsubscribe = EventsOn('state:patch', (patch: unknown): void => {
    patches.push(patch);
  });

  await expect(
    OpenDocument(initial.data!.snapshot.tabSetRevision),
  ).resolves.toEqual({
    status: 'opened',
    documentId: 'selected.md',
    projectionRevision: 1,
    activeBuffer: {
      documentId: 'selected.md',
      documentRevision: 0,
      projectionRevision: 1,
      content: '# selected',
    },
  });
  unsubscribe();

  expect(patches).toEqual([
    expect.objectContaining({
      revision: 1,
      tabSetRevision: 1,
      orderedDocumentIds: ['mock-document', 'selected.md'],
      activeDocumentId: 'selected.md',
      documents: {
        upsert: {
          'selected.md': expect.objectContaining({
            path: '/tmp/selected.md',
            title: 'selected.md',
          }),
        },
      },
    }),
  ]);
});

it('dev bridge dirty state follows disk baseline', async () => {
  await UpdateBuffer('mock-document', '# saved');
  expect((await GetState()).data?.snapshot.documents['mock-document']).toEqual(
    expect.objectContaining({ dirty: true, status: 'unsaved-changes' }),
  );

  await expect(Save('mock-document', 1, '')).resolves.toMatchObject({
    status: 'committed',
    data: expect.objectContaining({
      documentId: 'mock-document',
      lineEndingOutcome: 'preserved-lf',
    }),
  });
  expect((await GetState()).data?.snapshot.documents['mock-document']).toEqual(
    expect.objectContaining({ dirty: false, status: 'saved' }),
  );
});

it('mock Save As adopts its selected target only after a committed result', async () => {
  await UpdateBuffer('mock-document', '# saved as');

  await expect(SaveAs('mock-document', 1, '')).resolves.toMatchObject({
    status: 'committed',
    data: expect.objectContaining({ targetPathAdopted: true }),
  });
  expect((await GetState()).data?.snapshot.documents['mock-document']).toEqual(
    expect.objectContaining({ path: '/tmp/Untitled.md', status: 'saved' }),
  );
});
