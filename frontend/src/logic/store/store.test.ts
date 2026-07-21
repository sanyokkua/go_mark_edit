import { store } from './index';
import { dismissNotification, notifyError } from './notificationsSlice';
import type { WireError } from '../utils/parseError';

afterEach((): void => {
  for (const notification of store.getState().notifications.items) {
    store.dispatch(dismissNotification(notification.id));
  }
});

it('STORY-006-AC-2 creates projection-only notification state', () => {
  const error: WireError = {
    code: 'internal',
    title: 'Something went wrong',
    message: 'The command could not finish.',
    retryable: true,
  };

  store.dispatch(notifyError(error));

  const state = store.getState();
  expect(Object.keys(state).sort()).toEqual([
    'documents',
    'notifications',
    'ui',
  ]);
  expect(state.notifications.items).toEqual([
    expect.objectContaining({
      id: expect.any(Number),
      error,
    }),
  ]);
  expect(state.documents).toMatchObject({ byId: {} });
  expect(state.ui).toBeDefined();
  expect(state).not.toHaveProperty('content');
  expect(state).not.toHaveProperty('documents.content');
  expect(state).not.toHaveProperty('ui.content');
});
