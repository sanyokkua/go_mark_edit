import { act, fireEvent, render, screen } from '@testing-library/react';

import Notifications, {
  type NotificationNotice,
} from '../../src/ui/components/Notifications';

afterEach((): void => {
  jest.useRealTimers();
});

function notice(
  overrides: Partial<NotificationNotice> = {},
): NotificationNotice {
  return {
    id: 1,
    kind: 'warning',
    title: 'The link could not be opened',
    message: 'The target is outside the document folder.',
    actions: [],
    ...overrides,
  };
}

it('renders warning notices with their actions and an early dismissal control', () => {
  jest.useFakeTimers();
  const onDismiss = jest.fn();
  const onAction = jest.fn();

  render(
    <Notifications
      notices={[
        notice({
          actions: [{ id: 'retry', label: 'Retry', onActivate: onAction }],
        }),
      ]}
      onDismiss={onDismiss}
    />,
  );

  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onAction).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(onDismiss).toHaveBeenCalledWith(1);

  act((): void => {
    jest.advanceTimersByTime(7_999);
  });
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act((): void => {
    jest.advanceTimersByTime(1);
  });
  expect(onDismiss).toHaveBeenCalledTimes(2);
});

it('keeps stuck notices present until Retry or Cancel is activated', () => {
  const retry = jest.fn();
  const cancel = jest.fn();

  render(
    <Notifications
      notices={[
        notice({
          id: 2,
          kind: 'stuck',
          title: 'Save is taking longer than expected',
          actions: [
            { id: 'retry', label: 'Retry', onActivate: retry },
            { id: 'cancel', label: 'Cancel', onActivate: cancel },
          ],
          persistent: true,
        }),
      ]}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Save is taking longer than expected')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
});

it('does not automatically dismiss save errors', () => {
  jest.useFakeTimers();
  const onDismiss = jest.fn();

  render(
    <Notifications
      notices={[
        notice({
          id: 3,
          kind: 'error',
          title: 'Save failed',
          message: 'The file could not be written.',
        }),
      ]}
      onDismiss={onDismiss}
    />,
  );

  act((): void => {
    jest.advanceTimersByTime(60_000);
  });
  expect(onDismiss).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible();
});
