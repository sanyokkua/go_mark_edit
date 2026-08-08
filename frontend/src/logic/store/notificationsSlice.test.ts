import reducer, {
  clearCondition,
  dismissNotification,
  notifyCondition,
  notifyError,
  notifyToast,
} from './notificationsSlice';
import type { WireError } from '../utils/parseError';

function error(
  code: WireError['code'],
  title: string,
  message: string,
): WireError {
  return { code, title, message, retryable: true };
}

// Proves: FR-WS-016
it('deduplicates by classified code plus subject even when safe copy changes', () => {
  const first = notifyError(error('io', 'Could not save', 'Try again.'));
  const repeated = notifyError(
    error('io', 'Could not save', 'Check that the destination is writable.'),
  );
  first.payload.subject = 'document:active';
  repeated.payload.subject = 'document:active';

  const state = reducer(reducer(undefined, first), repeated);

  expect(state.items).toHaveLength(1);
  expect(state.items[0]).toMatchObject({
    count: 2,
    error: repeated.payload.error,
    message: 'The file operation could not be completed.',
    subject: 'document:active',
    title: 'File operation failed',
  });
});

// Proves: FR-WS-016
it('never evicts visible errors and promotes queued errors in arrival order', () => {
  const actions = [
    notifyError(error('io', 'First', 'First safe message.')),
    notifyError(error('busy', 'Second', 'Second safe message.')),
    notifyError(error('permission', 'Third', 'Third safe message.')),
    notifyError(error('timeout', 'Fourth', 'Fourth safe message.')),
    notifyError(error('internal', 'Fifth', 'Fifth safe message.')),
  ];
  const full = actions.reduce(reducer, reducer(undefined, { type: 'init' }));

  expect(full.items.map((item) => item.error?.title)).toEqual([
    'First',
    'Second',
    'Third',
  ]);
  expect(full.queuedErrors.map((item) => item.error?.title)).toEqual([
    'Fourth',
    'Fifth',
  ]);

  const promoted = reducer(full, dismissNotification(full.items[0].id));
  expect(promoted.items.map((item) => item.error?.title)).toEqual([
    'Second',
    'Third',
    'Fourth',
  ]);
  expect(promoted.queuedErrors.map((item) => item.error?.title)).toEqual([
    'Fifth',
  ]);
});

// Proves: FR-WS-016
it('displaces only the oldest non-error and drops non-errors behind three errors', () => {
  let state = reducer(undefined, notifyError(error('io', 'Error', 'Safe.')));
  state = reducer(
    state,
    notifyToast({
      code: 'info-a',
      message: 'First information.',
      severity: 'info',
      subject: 'a',
      title: 'First information',
    }),
  );
  state = reducer(
    state,
    notifyToast({
      code: 'warning-b',
      message: 'Warning.',
      severity: 'warning',
      subject: 'b',
      title: 'Warning',
    }),
  );
  state = reducer(
    state,
    notifyToast({
      code: 'success-c',
      message: 'Complete.',
      severity: 'success',
      subject: 'c',
      title: 'Complete',
    }),
  );
  expect(state.items.map((item) => item.title)).toEqual([
    'File operation failed',
    'Warning',
    'Complete',
  ]);

  for (const title of ['Second error', 'Third error']) {
    state = reducer(
      state,
      notifyError(error('internal', title, 'Safe.'), title),
    );
  }
  const before = state.items;
  state = reducer(
    state,
    notifyToast({
      code: 'later-info',
      message: 'Not shown.',
      severity: 'info',
      subject: 'later',
      title: 'Later information',
    }),
  );
  expect(state.items).toEqual(before);
  expect(state.items.every((item) => item.severity === 'error')).toBe(true);
});

// Proves: FR-WS-016
it('refreshes continuing conditions and keeps automatic success silent', () => {
  const condition = {
    code: 'offline',
    message: 'Changes remain local.',
    severity: 'warning' as const,
    subject: 'sync',
    title: 'Working offline',
  };
  let state = reducer(undefined, notifyCondition(condition));
  state = reducer(
    state,
    notifyCondition({ ...condition, message: 'Still working locally.' }),
  );
  expect(state.banners).toEqual([
    expect.objectContaining({
      count: 2,
      message: 'Still working locally.',
      refreshGeneration: 1,
    }),
  ]);

  state = reducer(
    state,
    notifyToast({
      automatic: true,
      code: 'automatic-save',
      message: 'Saved.',
      severity: 'success',
      subject: 'document:active',
      title: 'Saved',
    }),
  );
  expect(state.items).toEqual([]);

  state = reducer(state, clearCondition(state.banners[0].id));
  expect(state.banners).toEqual([]);
});

it('repeated failures update one notification with a count', () => {
  const first = notifyError(error('io', 'First failure', 'Safe detail.'));
  const second = notifyError(error('io', 'Second failure', 'New safe detail.'));
  first.payload.subject = 'document-1';
  second.payload.subject = 'document-1';

  const state = reducer(reducer(undefined, first), second);

  expect(state.items).toHaveLength(1);
  expect(state.items[0]).toMatchObject({ count: 2, subject: 'document-1' });
});
