import { fireEvent, render, screen } from '@testing-library/react';

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

it('T070 closes on its backdrop and keeps keyboard focus within the dialog', () => {
  const onOpenChange = jest.fn();
  render(<AboutDialog open onOpenChange={onOpenChange} version="2.7.4" />);

  const close = screen.getByRole('button', { name: 'Close' });
  close.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.pointerDown(document.querySelector('[aria-hidden="true"]')!);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
