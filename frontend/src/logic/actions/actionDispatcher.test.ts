import { dispatchAction } from './actionDispatcher';

it('T002 returns a localized unavailable result for deferred actions without invoking a handler', async () => {
  const invoke = jest.fn();
  await expect(dispatchAction('format', { invoke })).resolves.toMatchObject({
    status: 'unavailable',
    reason: 'deferred',
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('T002 suppresses editor actions without a focused identity-bound session', async () => {
  const invoke = jest.fn();
  await expect(
    dispatchAction('bold', {
      invoke,
      editorFocused: false,
      documentId: 'doc-1',
    }),
  ).resolves.toMatchObject({ status: 'unavailable', reason: 'no-editor' });
  expect(invoke).not.toHaveBeenCalled();
});

it('T033 rejects every deferred document and Assistant action before any gate or command', async () => {
  const invoke = jest.fn();
  for (const actionId of [
    'format',
    'compact',
    'lint',
    'toggle-assistant',
    'command-palette',
  ] as const) {
    await expect(
      dispatchAction(actionId, {
        documentId: 'doc-1',
        editorFocused: true,
        invoke,
        writable: true,
      }),
    ).resolves.toMatchObject({
      actionId,
      reason: 'deferred',
      status: 'unavailable',
    });
  }
  expect(invoke).not.toHaveBeenCalled();
});

it('T043 rejects unfocused application and window actions before invocation', async () => {
  const invoke = jest.fn();

  await expect(
    dispatchAction('settings', { applicationFocused: false, invoke }),
  ).resolves.toMatchObject({
    actionId: 'settings',
    reason: 'unsupported',
    status: 'unavailable',
  });
  await expect(
    dispatchAction('toggle-sidebar', { windowFocused: false, invoke }),
  ).resolves.toMatchObject({
    actionId: 'toggle-sidebar',
    reason: 'unsupported',
    status: 'unavailable',
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('T048 requires explicit focused context for application and window dispatch', async () => {
  const invoke = jest.fn();

  await expect(dispatchAction('settings', { invoke })).resolves.toMatchObject({
    actionId: 'settings',
    reason: 'unsupported',
    status: 'unavailable',
  });
  await expect(
    dispatchAction('toggle-sidebar', { invoke }),
  ).resolves.toMatchObject({
    actionId: 'toggle-sidebar',
    reason: 'unsupported',
    status: 'unavailable',
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('T043 refuses an available action without a typed invocation route', async () => {
  await expect(
    dispatchAction('bold', {
      documentId: 'doc-1',
      editorFocused: true,
      sessionDocumentId: 'doc-1',
      writable: true,
    }),
  ).resolves.toMatchObject({
    actionId: 'bold',
    reason: 'unsupported',
    status: 'unavailable',
  });
});

it('T009 dispatches New and Open as focused application commands', async () => {
  const invoke = jest.fn(async () => ({ status: 'opened' }));

  await expect(
    dispatchAction('new-file', { applicationFocused: true, invoke }),
  ).resolves.toMatchObject({ status: 'mutated', actionId: 'new-file' });
  await expect(
    dispatchAction('open-file', { applicationFocused: true, invoke }),
  ).resolves.toMatchObject({ status: 'mutated', actionId: 'open-file' });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('T009 dispatches Refresh preview as an available window action without a shortcut', async () => {
  const invoke = jest.fn(async () => undefined);

  await expect(
    dispatchAction('refresh-preview', { windowFocused: true, invoke }),
  ).resolves.toMatchObject({ status: 'mutated', actionId: 'refresh-preview' });
});
