import { render, screen } from '@testing-library/react';

import NotificationBanner from './Banner';

// Proves: FR-WS-016
it('renders a continuing condition as an inline localized banner', () => {
  render(
    <NotificationBanner
      notification={{
        code: 'offline',
        count: 1,
        id: 21,
        message: 'Changes will remain on this device.',
        refreshGeneration: 0,
        severity: 'warning',
        subject: 'sync',
        title: 'Working offline',
      }}
    />,
  );

  expect(
    screen.getByRole('status', { name: 'Working offline' }),
  ).toHaveTextContent('Changes will remain on this device.');
});
