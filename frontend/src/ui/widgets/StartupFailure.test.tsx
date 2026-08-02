import { fireEvent, render, screen } from '@testing-library/react';

import StartupFailure from './StartupFailure';

// Proves: FR-WS-013
it('shows only the exact safe localized recovery copy and invokes Retry', () => {
  const onRetry = jest.fn();
  render(<StartupFailure isRetrying={false} onRetry={onRetry} />);

  expect(
    screen.getByRole('heading', { name: 'GoMarkEdit could not start' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'GoMarkEdit could not initialize its local settings. Please try again.',
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(document.body).not.toHaveTextContent(
    /\/Users\/|[A-Z]:\\|sqlite|raw error/i,
  );
});
