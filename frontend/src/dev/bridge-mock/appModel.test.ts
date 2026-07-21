import {
  GetState,
  SetDocView,
  SetUILayout,
  UpdateBuffer,
} from './go/appmodel/AppModelHandler';
import { EventsOn } from './runtime';

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
      activeBuffer: { documentId: 'mock-document', content: '' },
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
