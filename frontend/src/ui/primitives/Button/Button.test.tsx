import { fireEvent, render, screen } from '@testing-library/react';

import Button from './Button';

// Proves: FR-038 — Button exposes the three shared action variants.
it('T023 renders a labelled Button variant and activates it', () => {
  const onClick = jest.fn();
  render(
    <Button variant="primary" onClick={onClick}>
      Save
    </Button>,
  );

  const button = screen.getByRole('button', { name: 'Save' });
  expect(button).toHaveAttribute('data-button-variant', 'primary');
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
});

// Proves: FR-038 — Button forwards disabled state without invoking its handler.
it('T023 keeps a disabled Button unavailable', () => {
  const onClick = jest.fn();
  render(
    <Button disabled variant="quiet" onClick={onClick}>
      Cancel
    </Button>,
  );

  const button = screen.getByRole('button', { name: 'Cancel' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
});
