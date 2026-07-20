import { act, render, screen } from '@testing-library/react';

import { NotificationToast, ToastProvider } from './Toast';

afterEach((): void => {
  jest.useRealTimers();
});

it('STORY-006-AC-3 presents an accessible error toast and dismisses it after five seconds', () => {
  jest.useFakeTimers();
  const onDismiss = jest.fn<void, [number]>();

  render(
    <ToastProvider>
      <NotificationToast
        notification={{
          id: 8,
          error: {
            code: 'validation',
            title: 'Invalid setting',
            message: 'Choose a supported theme.',
            retryable: false,
          },
        }}
        onDismiss={onDismiss}
      />
    </ToastProvider>,
  );

  expect(screen.getByText('Invalid setting')).toBeVisible();
  expect(screen.getByText('Choose a supported theme.')).toBeVisible();
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'assertive');

  act((): void => {
    jest.advanceTimersByTime(5_000);
  });

  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledWith(8);
});
