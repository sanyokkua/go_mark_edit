import { createEvent, fireEvent, render, screen } from '@testing-library/react';

import ToolButton from './ToolButton';

// Proves: FR-038 — an icon ToolButton is square, stateful and preserves selection.
it('T023 preserves selection and exposes icon button state', () => {
  const onActivate = jest.fn();
  render(
    <ToolButton
      checked
      icon="bold"
      label="Bold"
      pressed
      variant="icon"
      onActivate={onActivate}
    />,
  );

  const button = screen.getByRole('button', { name: 'Bold' });
  const event = createEvent.mouseDown(button);
  fireEvent(button, event);

  expect(event.defaultPrevented).toBe(true);
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(button).toHaveAttribute('aria-checked', 'true');
  expect(button).toHaveAttribute('data-tool-button-variant', 'icon');
  fireEvent.click(button);
  expect(onActivate).toHaveBeenCalledTimes(1);
});

// Proves: FR-038 — a disabled ToolButton cannot activate.
it('T023 keeps a disabled ToolButton unavailable', () => {
  const onActivate = jest.fn();
  render(
    <ToolButton
      disabled
      icon="bold"
      label="Bold"
      variant="icon"
      onActivate={onActivate}
    />,
  );

  const button = screen.getByRole('button', { name: 'Bold' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onActivate).not.toHaveBeenCalled();
});
