import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { NotificationToast, ToastProvider } from '../../../src/ui/primitives/Toast';

afterEach((): void => {
  jest.useRealTimers();
});

it('presents an accessible error toast without automatic dismissal', () => {
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
          remediations: [],
          title: 'Invalid setting',
          error: {
            code: 'validation',
            title: 'Invalid setting',
            message: 'Choose a supported theme.',
            retryable: false,
          },
        }}
        onDismiss={onDismiss}
        onRemediate={jest.fn()}
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
          remediations: [],
          code: 'completed',
          title: 'Operation complete',
          message: 'The operation finished.',
        }}
        onDismiss={onDismiss}
        onRemediate={jest.fn()}
      />
    </ToastProvider>,
  );

  expect(screen.getByText('Operation complete ×2')).toBeVisible();
  act((): void => jest.advanceTimersByTime(duration - 1));
  expect(onDismiss).not.toHaveBeenCalled();
  act((): void => jest.advanceTimersByTime(1));
  expect(onDismiss).toHaveBeenCalledWith(duration);
});

/*
 * . Two contract rows pair two actions — "Retry; a Reveal failure also
 * offers Copy path" — and this rendered `notification.remediation`, one button.
 * The second member of every pair was unreachable in the running application no
 * matter how faithfully Go sent it.
 */
// each runs its own command). It does not prove which pair Go sends — that is
// asserted in `classifiedNotification.test.ts`.
it('renders every offered control in contract order and reports the one clicked', () => {
  const onRemediate = jest.fn();
  const retry = {
    action: 'retry' as const,
    documentId: 'one',
    intent: 'reveal' as const,
    labelKey: 'action.retry.label',
  };
  const copyPath = {
    action: 'copy-path' as const,
    documentId: 'one',
    intent: 'copy-path' as const,
    labelKey: 'action.copy-path.label',
  };
  render(
    <ToastProvider>
      <NotificationToast
        notification={{
          code: 'system-command-failure',
          count: 1,
          id: 92,
          message: 'The file manager could not reveal the document.',
          refreshGeneration: 0,
          remediations: [retry, copyPath],
          severity: 'error',
          subject: 'reveal:one',
          title: 'one.md',
        }}
        onDismiss={jest.fn()}
        onRemediate={onRemediate}
      />
    </ToastProvider>,
  );

  // Dismiss is the trailing control on an error toast and is not a remediation.
  expect(
    screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .slice(0, 2),
  ).toEqual(['Retry', 'Copy path']);

  fireEvent.click(screen.getByRole('button', { name: 'Copy path' }));
  expect(onRemediate).toHaveBeenCalledWith(copyPath);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRemediate).toHaveBeenLastCalledWith(retry);
});

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
          remediations: [
            {
              action: 'retry',
              intent: 'copy-path',
              labelKey: 'action.retry.label',
            },
          ],
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
    action: 'retry',
    intent: 'copy-path',
    labelKey: 'action.retry.label',
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

it('renders one explicit save confirmation with its localized safe filename', () => {
  render(
    <ToastProvider>
      <NotificationToast
        notification={{
          code: 'save-success',
          count: 1,
          id: 101,
          message: 'Saved selected.md · UTF-8 · LF',
          refreshGeneration: 0,
          remediations: [],
          severity: 'success',
          subject: 'document-1',
          title: 'Saved',
        }}
        onDismiss={jest.fn()}
        onRemediate={jest.fn()}
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

/*
 * . `keeps the parity toast surface at the reference scroll origin`
 * was removed with the surface it tested.
 *
 * `ParityToastSurface` replaced the entire notification stack on `?parity-case`
 * with four hardcoded toasts — none of them carrying `NotificationToast`'s
 * dismiss or remediate wiring, and one of them a **provider** toast, which
 * forbids the application from having at all.
 *
 * It also quietly defeated the harness that was supposed to exercise it. The
 * `toasts` family's driver performs a real Save and waits for
 * `[data-notification-code]` to appear — and the fake surface rendered
 * `data-notification-code="parity"`, so that wait was satisfied by the
 * substitute rather than by the notification the save actually raised.
 */
