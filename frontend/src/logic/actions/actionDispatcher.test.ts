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

it('T030 dispatches Exit as a focused application command', async () => {
  const invoke = jest.fn(async () => undefined);

  await expect(
    dispatchAction('exit', { applicationFocused: true, invoke }),
  ).resolves.toMatchObject({ status: 'mutated', actionId: 'exit' });
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('T009 dispatches Refresh preview as an available window action without a shortcut', async () => {
  const invoke = jest.fn(async () => undefined);

  await expect(
    dispatchAction('refresh-preview', { windowFocused: true, invoke }),
  ).resolves.toMatchObject({ status: 'mutated', actionId: 'refresh-preview' });
});

it('T015 refuses Save before invoking the bridge for a read-only document', async () => {
  const invoke = jest.fn();

  await expect(
    dispatchAction('save', {
      documentId: 'doc-1',
      sessionDocumentId: 'doc-1',
      writable: false,
      invoke,
    }),
  ).resolves.toMatchObject({
    actionId: 'save',
    reason: 'no-document',
    status: 'unavailable',
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('T030 dispatches an active-tab command from projected state through its typed invoke', async () => {
  const invoke = jest.fn(async () => ({ status: 'closed' }));

  await expect(
    dispatchAction('close-tab', {
      applicationFocused: true,
      documentId: 'doc-1',
      invoke,
      projectedState: {
        activeDocumentId: 'doc-1',
        orderedDocumentIds: ['doc-1', 'doc-2'],
        documents: { 'doc-1': { capability: 'read-only' } },
      },
    }),
  ).resolves.toMatchObject({ status: 'mutated', actionId: 'close-tab' });
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('T030 returns deterministic availability outcomes before invoking a command', async () => {
  const invoke = jest.fn();
  const projectedState = {
    activeDocumentId: 'doc-1',
    orderedDocumentIds: ['doc-1'],
    documents: { 'doc-1': { capability: 'writable' } },
  };

  await expect(
    dispatchAction('close-tab', {
      applicationFocused: true,
      invoke,
      modalOpen: true,
      projectedState,
    }),
  ).resolves.toMatchObject({ status: 'unavailable', reason: 'modal' });
  await expect(
    dispatchAction('move-tab-right', {
      applicationFocused: true,
      documentId: 'doc-1',
      invoke,
      projectedState,
      targetIndex: 1,
    }),
  ).resolves.toMatchObject({ status: 'unavailable', reason: 'edge' });
  expect(invoke).not.toHaveBeenCalled();
});

it('T109 reports a refused invocation as refused and carries its classified error', async () => {
  /*
   * Every backend carrier in appModelTypes.ts pairs a `refused` status with an
   * optional ClassifiedError, but the dispatcher matched only the literal
   * 'unavailable', so a refusal fell through to `mutated` — a command that was
   * turned down reported as a mutation that happened, with the backend's
   * message dropped on the floor.
   */
  const error = {
    category: 'capacity-limit',
    message: 'The window already contains 40 documents.',
    remediation: 'Cancel',
    documentId: 'doc-1',
    dedupKey: 'doc-1:capacity-limit',
    safeSubject: 'doc-1',
  };
  const invoke = jest.fn(async () => ({ status: 'refused', error }));

  await expect(
    dispatchAction('close-tab', {
      applicationFocused: true,
      documentId: 'doc-1',
      invoke,
    }),
  ).resolves.toMatchObject({
    status: 'refused',
    actionId: 'close-tab',
    error: { message: 'The window already contains 40 documents.' },
  });
  expect(invoke).toHaveBeenCalledTimes(1);
});

// Proves: FR-FT-006 — the same clause at the dispatcher, which is the seam a
// keyboard shortcut reaches. Availability describes a control; the dispatcher
// is what refuses to run the command when something bypasses the control, and
// FR-FT-006 says the commands must be unavailable, not merely dimmed.
it('T157 refuses to dispatch a write command for an unsafe-read-only document', async () => {
  const projectedState = {
    activeDocumentId: 'unsafe',
    orderedDocumentIds: ['unsafe'],
    documents: {
      unsafe: { capability: 'unsafe-read-only', path: '/documents/broken.md' },
    },
    canReopenLastFile: false,
  };

  for (const id of ['save', 'save-as'] as const) {
    const invoke = jest.fn();
    await expect(
      dispatchAction(id, { projectedState, documentId: 'unsafe', invoke }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      actionId: id,
      reason: 'no-document',
    });
    expect(invoke).not.toHaveBeenCalled();
  }
});
