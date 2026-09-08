import { fireEvent, render, screen } from '@testing-library/react';

import SettingsDialog from './SettingsDialog';

function renderDialog(onOpenChange = jest.fn<void, [boolean]>()) {
  render(
    <SettingsDialog
      mode="auto"
      onModeChange={jest.fn()}
      onOpenChange={onOpenChange}
      onReset={jest.fn()}
      onThemeChange={jest.fn()}
      open
      theme="material"
    />,
  );
  return onOpenChange;
}

// Proves: FR-WS-015, FR-WS-017
it('contains only delivered Appearance controls and traps keyboard focus', () => {
  renderDialog();

  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(dialog).toHaveFocus();
  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
  expect(
    screen.getByRole('radiogroup', { name: 'Appearance' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/assistant|editor settings|files|future/i),
  ).toBeNull();

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([tabindex="-1"]), button[tabindex="0"]',
    ),
  );
  focusable.at(-1)?.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(focusable[0]).toHaveFocus();

  focusable[0].focus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(focusable.at(-1)).toHaveFocus();
});

// Proves: FR-WS-015, FR-WS-017
it('closes on Escape and restores focus to the opener', () => {
  const opener = document.createElement('button');
  opener.textContent = 'Open settings';
  document.body.append(opener);
  opener.focus();
  const onOpenChange = jest.fn<void, [boolean]>();
  const { rerender } = render(
    <SettingsDialog
      mode="auto"
      onModeChange={jest.fn()}
      onOpenChange={onOpenChange}
      onReset={jest.fn()}
      onThemeChange={jest.fn()}
      open
      theme="material"
    />,
  );

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  rerender(
    <SettingsDialog
      mode="auto"
      onModeChange={jest.fn()}
      onOpenChange={onOpenChange}
      onReset={jest.fn()}
      onThemeChange={jest.fn()}
      open={false}
      theme="material"
    />,
  );
  expect(opener).toHaveFocus();
});
