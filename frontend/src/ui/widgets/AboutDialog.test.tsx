import { render, screen } from '@testing-library/react';

import AboutDialog from './AboutDialog';

it('FR-WS-019 renders the exact projected Go build identity', () => {
  render(
    <AboutDialog open onOpenChange={jest.fn()} version="2.7.4-test+injected" />,
  );

  expect(
    screen.getByRole('dialog', { name: 'About GoMarkEdit' }),
  ).toHaveTextContent('Version 2.7.4-test+injected');
  expect(screen.queryByText('0.0.0')).not.toBeInTheDocument();
});
