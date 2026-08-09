import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { NotificationToast, ToastProvider } from './Toast';

afterEach((): void => {
  jest.useRealTimers();
});

it('STORY-006-AC-3 presents an accessible error toast without automatic dismissal', () => {
  jest.useFakeTimers();
  const onDismiss = jest.fn<void, [number]>();

  render(
    <ToastProvider>
      <NotificationToast
        notification={{
          code: 'validation',
          id: 8,
          severity: 'error',
          subject: 'Invalid setting',
          count: 1,
          message: 'Choose a supported theme.',
          refreshGeneration: 0,
          title: 'Invalid setting',
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

  expect(onDismiss).not.toHaveBeenCalled();
});

// Proves: FR-WS-016
it.each([
  ['success', 4_000],
  ['info', 6_000],
  ['warning', 8_000],
] as const)('dismisses %s after exactly %d ms', (severity, duration) => {
  jest.useFakeTimers();
  const onDismiss = jest.fn<void, [number]>();
  render(
    <ToastProvider>
      <NotificationToast
        notification={{
          id: duration,
          severity,
          subject: 'completed-operation',
          count: 2,
          refreshGeneration: 1,
          code: 'completed',
          title: 'Operation complete',
          message: 'The operation finished.',
        }}
        onDismiss={onDismiss}
      />
    </ToastProvider>,
  );

  expect(screen.getByText('Operation complete ×2')).toBeVisible();
  act((): void => jest.advanceTimersByTime(duration - 1));
  expect(onDismiss).not.toHaveBeenCalled();
  act((): void => jest.advanceTimersByTime(1));
  expect(onDismiss).toHaveBeenCalledWith(duration);
});

// Proves: FR-WS-016
it('offers only the localized remediation label and keeps toasts above dialogs', () => {
  const onRemediate = jest.fn();
  render(
    <ToastProvider>
      <NotificationToast
        notification={{
          code: 'retryable-operation',
          count: 1,
          id: 91,
          message: 'The operation can be tried again.',
          refreshGeneration: 0,
          remediation: { action: 'retry-operation', labelKey: 'startup.retry' },
          severity: 'warning',
          subject: 'operation',
          title: 'Operation paused',
        }}
        onDismiss={jest.fn()}
        onRemediate={onRemediate}
      />
    </ToastProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRemediate).toHaveBeenCalledWith({
    action: 'retry-operation',
    labelKey: 'startup.retry',
  });

  const tokens = readFileSync(
    resolve(process.cwd(), 'src/ui/styles/tokens.css'),
    'utf8',
  );
  const modal = Number(/--z-modal:\s*(\d+)/u.exec(tokens)?.[1]);
  const toast = Number(/--z-toast:\s*(\d+)/u.exec(tokens)?.[1]);
  expect(toast).toBeGreaterThan(modal);
  expect(
    readFileSync(
      resolve(process.cwd(), 'src/ui/primitives/Toast.module.css'),
      'utf8',
    ),
  ).toContain('z-index: var(--z-toast)');
  expect(
    readFileSync(
      resolve(process.cwd(), 'src/ui/primitives/Toast.module.css'),
      'utf8',
    ),
  ).toMatch(/inset: auto 16px 40px auto/);
});

it('T015 renders one explicit save confirmation with its localized safe filename', () => {
  render(
    <ToastProvider>
      <NotificationToast
        notification={{
          code: 'save-success',
          count: 1,
          id: 101,
          message: 'Saved selected.md · UTF-8 · LF',
          refreshGeneration: 0,
          severity: 'success',
          subject: 'document-1',
          title: 'Saved',
        }}
        onDismiss={jest.fn()}
      />
    </ToastProvider>,
  );

  expect(screen.getByText('Saved')).toBeVisible();
  expect(screen.getByText('Saved selected.md · UTF-8 · LF')).toBeVisible();
  expect(document.querySelector('[data-notification-code]')).toHaveAttribute(
    'data-notification-code',
    'save-success',
  );
});
