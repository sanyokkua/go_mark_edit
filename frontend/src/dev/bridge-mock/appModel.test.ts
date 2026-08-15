import {
  ActivateDocument,
  AuthorizeKeepMine,
  CheckExternalChanges,
  CancelConflict,
  GetState,
  NewDocument,
  OpenDocument,
  PrepareClose,
  Save,
  SaveAs,
  SkipConflict,
  resetMockAppModel,
  setMockOpenSelection,
  setMockConflictResult,
  SetDocView,
  SetUILayout,
  UpdateBuffer,
} from './go/appmodel/AppModelHandler';
import { EventsOn } from './runtime';

beforeEach(() => {
  resetMockAppModel();
});

it('seeds the deterministic two-document fixture only on the parity route', async () => {
  const originalSearch = window.location.search;
  window.history.replaceState({}, '', '/?parity-case=fixture');
  try {
    resetMockAppModel();
    const result = await GetState();
    expect(result.data?.snapshot.orderedDocumentIds).toEqual([
      'parity-release-notes',
      'parity-spec-draft',
    ]);
    expect(result.data?.snapshot.activeDocumentId).toBe('parity-release-notes');
    expect(result.data?.snapshot.documents).toEqual(
      expect.objectContaining({
        'parity-release-notes': expect.objectContaining({
          title: 'release-notes.md',
          path: '/tmp/Notes/projects/release-notes.md',
          dirty: true,
          status: 'autosaved',
          wordCount: 42,
        }),
        'parity-spec-draft': expect.objectContaining({
          title: 'spec-draft.md',
          path: '/tmp/Notes/projects/spec-draft.md',
        }),
      }),
    );
    expect(
      result.data?.snapshot.documents['parity-release-notes'].view.selection,
    ).toEqual({
      start: { line: 4, column: 1 },
      end: {
        line: 5,
        column: 'improvments and fixs users asked for.'.length + 1,
      },
    });
    expect(result.data?.activeBuffer?.content).toContain('# Release Notes');
  } finally {
    window.history.replaceState({}, '', `/${originalSearch}`);
    resetMockAppModel();
  }
});

it('maps parity state IDs to deterministic bridge fixtures without changing startup', async () => {
  const originalSearch = window.location.search;
  const state = (stateId: string): void => {
    window.history.replaceState(
      {},
      '',
      `/?parity-case=state:${stateId}:minimal-light`,
    );
    resetMockAppModel();
  };
  try {
    state('status-saved');
    expect(
      (await GetState()).data?.snapshot.documents['parity-release-notes'],
    ).toEqual(expect.objectContaining({ dirty: false, status: 'saved' }));

    state('status-read-only');
    expect(
      (await GetState()).data?.snapshot.documents['parity-release-notes'],
    ).toEqual(
      /*
       * T108: `read-only` is a save status, never a capability. Go emits
       * exactly writable / unsafe-read-only / large-read-only / refused
       * (`internal/file/document_reader.go:25-28`). This assertion pinned the
       * impossible value the mock used to seed, which is what kept every
       * browser case away from the capability branch FR-FT-005's visible
       * reason is derived from.
       */
      expect.objectContaining({
        capability: 'unsafe-read-only',
        status: 'read-only',
      }),
    );

    state('preview-paused');
    expect(
      (await GetState()).data?.activeBuffer?.content.length,
    ).toBeGreaterThan(2_097_152);

    state('tab-40-document');
    expect((await GetState()).data?.snapshot.orderedDocumentIds).toHaveLength(
      40,
    );

    state('launcher-six-file');
    expect((await GetState()).data?.snapshot.recentFiles).toEqual([
      '/tmp/parity-recent-06.md',
      '/tmp/parity-recent-05.md',
      '/tmp/parity-recent-04.md',
      '/tmp/parity-recent-03.md',
      '/tmp/parity-recent-02.md',
      '/tmp/parity-recent-01.md',
    ]);

    state('launcher-first-run');
    expect((await GetState()).data?.snapshot.recentFiles).toEqual([]);
    expect((await GetState()).data?.snapshot.canReopenLastFile).toBe(false);

    window.history.replaceState({}, '', `/${originalSearch}`);
    resetMockAppModel();
    const normal = await GetState();
    expect(normal.data?.snapshot.orderedDocumentIds).toEqual(['mock-document']);
    expect(normal.data?.activeBuffer?.content).toBe('');
  } finally {
    window.history.replaceState({}, '', `/${originalSearch}`);
    resetMockAppModel();
  }
});

it('does not leak FT-VS-07 recents into the primary parity empty route', async () => {
  const originalSearch = window.location.search;
  try {
    window.history.replaceState(
      {},
      '',
      '/?ft-vs-07&parity-case=primary:empty:1280:glass-light',
    );
    resetMockAppModel();

    const result = await GetState();

    expect(result.data?.snapshot.recentFiles).toEqual([]);
    expect(result.data?.snapshot.canReopenLastFile).toBe(false);
  } finally {
    window.history.replaceState({}, '', `/${originalSearch}`);
    resetMockAppModel();
  }
});

it('exposes parity-only close-plan fixtures for normalization and conflict states', async () => {
  const originalSearch = window.location.search;
  try {
    window.history.replaceState(
      {},
      '',
      '/?close-plan&parity-case=state:prompt-normalization:minimal-light',
    );
    resetMockAppModel();
    const initial = await GetState();
    const prepared = await PrepareClose(
      'single',
      ['parity-release-notes'],
      initial.data!.snapshot.tabSetRevision,
    );
    expect(prepared.data?.targets[0]).toEqual(
      expect.objectContaining({
        normalizationToken: 'parity-normalization-token',
        proposedEnding: 'lf',
      }),
    );

    window.history.replaceState(
      {},
      '',
      '/?ft-vs-04&parity-case=state:conflict-read-only:minimal-light',
    );
    resetMockAppModel();
    const conflictState = await GetState();
    const conflict = await ActivateDocument(
      'parity-spec-draft',
      conflictState.data!.snapshot.tabSetRevision,
    );
    expect(conflict.conflict).toEqual(
      expect.objectContaining({ readOnly: true }),
    );
  } finally {
    window.history.replaceState({}, '', `/${originalSearch}`);
    resetMockAppModel();
  }
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

it('mock conflict bridge preserves bounded preview and decision outcomes', async () => {
  const preview = {
    documentId: 'mock-document',
    displayName: 'notes.md',
    contentRevision: 2,
    detectedDiskVersion: {
      exists: true,
      size: 12,
      modifiedUnixNano: 3,
      mode: 0o644,
    },
    onDisk: {
      text: 'disk\n',
      lineCount: 1,
      byteCount: 5,
      truncated: false,
    },
    yours: {
      text: 'mine\n',
      lineCount: 1,
      byteCount: 5,
      truncated: false,
    },
    readOnly: false,
  };
  setMockConflictResult('checkExternalChanges', {
    status: 'detected',
    documentId: 'mock-document',
    documentRevision: 2,
    preview,
  });
  setMockConflictResult('authorizeKeepMine', {
    status: 'authorized',
    documentId: 'mock-document',
    decisionToken: 'decision-1',
  });

  await expect(CheckExternalChanges('mock-document')).resolves.toEqual({
    status: 'detected',
    documentId: 'mock-document',
    documentRevision: 2,
    preview,
  });
  await expect(
    AuthorizeKeepMine('mock-document', 2, '/tmp/notes.md', {
      exists: true,
      size: 12,
      modifiedUnixNano: 3,
      mode: 0o644,
    }),
  ).resolves.toMatchObject({
    status: 'authorized',
    decisionToken: 'decision-1',
  });
  await expect(
    SkipConflict('mock-document', 2, preview.detectedDiskVersion),
  ).resolves.toMatchObject({
    status: 'skipped',
  });
  await expect(
    CancelConflict('mock-document', 2, preview.detectedDiskVersion),
  ).resolves.toMatchObject({
    status: 'cancelled',
  });
  expect((await GetState()).data?.snapshot.documents['mock-document']).toEqual(
    expect.objectContaining({ conflictBlocked: true }),
  );
});
