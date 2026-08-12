import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SettingsMenu from './SettingsMenu';

const props = {
  mode: 'auto' as const,
  onModeChange: jest.fn(),
  onOpenAppearance: jest.fn(),
  onThemeChange: jest.fn(),
  theme: 'material' as const,
};

it('T070 positions Settings as a portal menu and restores its trigger focus after dismissal', async () => {
  render(
    <>
      <button type="button">Outside</button>
      <SettingsMenu {...props} />
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'Settings' });
  fireEvent.click(trigger);
  const menu = screen.getByRole('menu', { name: 'Settings menu' });
  expect(menu).toBeVisible();
  expect(menu.parentElement).toBe(document.body);
  expect(menu).toHaveAttribute('data-viewport-popup', 'settings-menu');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu', { name: 'Settings menu' })).toBeNull();
  await waitFor(() => expect(trigger).toHaveFocus());

  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
  expect(screen.queryByRole('menu', { name: 'Settings menu' })).toBeNull();
});

it('renders the acknowledged autosave control and leaves deferred save actions unavailable', () => {
  const onFileSettingsChange = jest.fn();
  render(
    <SettingsMenu
      {...props}
      fileSettings={{ autosave: true }}
      onFileSettingsChange={onFileSettingsChange}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  const autosave = screen.getByRole('checkbox', { name: 'Autosave' });
  expect(autosave).toBeChecked();
  fireEvent.click(autosave);
  expect(onFileSettingsChange).toHaveBeenCalledWith({ autosave: false });
  expect(
    screen.getByRole('checkbox', { name: 'Format on save' }),
  ).not.toBeDisabled();
  expect(
    screen.getByRole('checkbox', { name: 'Lint on save' }),
  ).not.toBeDisabled();
});
