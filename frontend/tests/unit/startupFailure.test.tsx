import { fireEvent, render, screen } from '@testing-library/react';

import StartupFailure from '../../src/ui/widgets/StartupFailure/StartupFailure';

it('names a failed settings step with its safe category and offers both actions', () => {
  const onRetry = jest.fn();
  const onQuit = jest.fn();

  render(
    <StartupFailure
      failure={{
        category: 'database unreadable',
        step: 'settings',
        timedOut: false,
      }}
      isRetrying={false}
      onQuit={onQuit}
      onRetry={onRetry}
    />,
  );

  expect(screen.getByText('Settings: database unreadable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Quit' }));

  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onQuit).toHaveBeenCalledTimes(1);
  expect(document.body).not.toHaveTextContent(
    /\/Users\/|[A-Z]:\\|stack trace|raw error/i,
  );
});

it('names a timed-out bridge step and offers only Quit', () => {
  render(
    <StartupFailure
      failure={{ category: 'internal', step: 'bridge', timedOut: true }}
      isRetrying={false}
      onQuit={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(
    screen.getByText('Bridge did not answer within 10 seconds'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retry' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Quit' })).toBeInTheDocument();
});

it('keeps Quit available while a retry is running', () => {
  render(
    <StartupFailure
      failure={{ category: 'io', step: 'model', timedOut: false }}
      isRetrying
      onQuit={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Quit' })).toBeEnabled();
});
