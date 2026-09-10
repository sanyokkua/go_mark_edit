import { dispatchAction } from '../../../src/logic/actions/actionDispatcher';

const documentContext = {
  documentId: 'doc-1',
  editorFocused: true,
  sessionDocumentId: 'doc-1',
  writable: true,
};

it('keeps committed, cancelled, prompt, conflict, refused and mutated command outcomes typed', async () => {
  await expect(
    dispatchAction('save', {
      ...documentContext,
      invoke: async () => ({ status: 'committed', data: { revision: 4 } }),
    }),
  ).resolves.toMatchObject({ status: 'committed', actionId: 'save' });

  await expect(
    dispatchAction('save', {
      ...documentContext,
      invoke: async () => ({ status: 'cancelled' }),
    }),
  ).resolves.toMatchObject({ status: 'cancelled', actionId: 'save' });

  await expect(
    dispatchAction('save', {
      ...documentContext,
      invoke: async () => ({ status: 'needs-normalization' }),
    }),
  ).resolves.toMatchObject({ status: 'prompt', actionId: 'save' });

  await expect(
    dispatchAction('save', {
      ...documentContext,
      invoke: async () => ({ status: 'conflict' }),
    }),
  ).resolves.toMatchObject({ status: 'conflict', actionId: 'save' });

  await expect(
    dispatchAction('save', {
      ...documentContext,
      invoke: async () => ({ status: 'refused' }),
    }),
  ).resolves.toMatchObject({ status: 'refused', actionId: 'save' });

  await expect(
    dispatchAction('save', {
      ...documentContext,
      invoke: async () => undefined,
    }),
  ).resolves.toMatchObject({ status: 'mutated', actionId: 'save' });
});

it('does not report an unknown command status as a mutation', async () => {
  await expect(
    dispatchAction('save', {
      ...documentContext,
      invoke: async () => ({ status: 'future-outcome' }),
    }),
  ).resolves.toMatchObject({
    actionId: 'save',
    reason: 'unsupported',
    status: 'unavailable',
  });
});

it('preserves the active session identity when a command races a document switch', async () => {
  const invoke = jest.fn();

  await expect(
    dispatchAction('close-tab', {
      applicationFocused: true,
      documentId: 'expected-doc',
      invoke,
      sessionDocumentId: 'current-doc',
    }),
  ).resolves.toEqual({
    actionId: 'close-tab',
    currentSessionIdentity: 'current-doc',
    expectedDocumentId: 'expected-doc',
    status: 'document-mismatch',
  });
  expect(invoke).not.toHaveBeenCalled();
});
