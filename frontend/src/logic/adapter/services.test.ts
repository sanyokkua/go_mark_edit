import {
  createDocumentLifecycleAdapter,
  createSettingsAdapter,
  type DocumentLifecycleBindings,
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
  };
  const adapter = createSettingsAdapter(bindings);

  await expect(adapter.resetAppearance()).resolves.toBeUndefined();
  expect(resetAppearance).toHaveBeenCalledTimes(1);
  expect(resetAppearance).toHaveBeenCalledWith();
});

it('T009 preserves classified New/Open outcomes through guarded lifecycle bindings', async () => {
  const bindings: DocumentLifecycleBindings = {
    newDocument: jest.fn(async (_expectedTabSetRevision: number) => ({
      data: { documentId: 'new-doc', content: '' },
    })),
    openDocument: jest.fn(async (_expectedTabSetRevision: number) => ({
      status: 'cancelled' as const,
    })),
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
