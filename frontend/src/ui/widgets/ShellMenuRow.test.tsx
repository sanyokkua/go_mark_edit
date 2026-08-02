import { fireEvent, render, screen, within } from '@testing-library/react';

import type { SettingsMenuProps } from './SettingsMenu';
import ShellMenuRow from './ShellMenuRow';

jest.mock('../../logic/adapter', () => ({
  windowAdapter: { toggleFullscreen: jest.fn(async () => true) },
}));

const settingsMenuProps: SettingsMenuProps = {
  mode: 'auto',
  onModeChange: jest.fn(),
  onOpenAppearance: jest.fn(),
  onThemeChange: jest.fn(),
  theme: 'material',
};

const viewMenuProps = {
  editorVisible: true,
  onEditorVisibilityChange: jest.fn(),
  onPreviewVisibilityChange: jest.fn(),
  previewVisible: true,
};

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1024,
  });
});

it('FR-WS-014 renders Settings, View, About in binding order without File', () => {
  const onAbout = jest.fn();
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={onAbout}
      settingsMenuProps={settingsMenuProps}
      toggleFullscreen={jest.fn(async () => true)}
      viewMenuProps={viewMenuProps}
    />,
  );

  const menu = screen.getByRole('navigation', {
    name: 'Application actions',
  });
  expect(
    within(menu)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Settings', 'View', 'About']);
  expect(within(menu).queryByText('File')).not.toBeInTheDocument();

  fireEvent.click(within(menu).getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('menu', { name: 'Settings menu' })).toBeVisible();
  fireEvent.click(within(menu).getByRole('button', { name: 'Settings' }));

  fireEvent.keyDown(within(menu).getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });
  const viewMenu = screen.getByRole('menu', { name: 'View' });
  expect(viewMenu).toBeVisible();
  fireEvent.keyDown(viewMenu, { key: 'Escape' });

  fireEvent.click(within(menu).getByRole('button', { name: 'About' }));
  expect(onAbout).toHaveBeenCalledTimes(1);
});

it('FR-WS-014 moves the same ordered actions into overflow at narrow width', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  const onAbout = jest.fn();
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={onAbout}
      settingsMenuProps={settingsMenuProps}
      toggleFullscreen={jest.fn(async () => true)}
      viewMenuProps={viewMenuProps}
    />,
  );

  const overflow = screen.getByRole('button', { name: 'More actions' });
  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual(['Settings', 'View', 'About']);
  expect(screen.queryByText('File')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
  expect(screen.getByRole('menu', { name: 'Settings menu' })).toBeVisible();

  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'View' }));
  const viewMenu = screen.getByRole('menu', { name: 'View options' });
  expect(viewMenu).toBeVisible();
  fireEvent.keyDown(viewMenu, { key: 'Escape' });

  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'About' }));
  expect(onAbout).toHaveBeenCalledTimes(1);
});

it('FR-WS-008 switches to the keyboard-reachable overflow only at the 375-pixel state', () => {
  const { rerender } = render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );
  expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();

  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  fireEvent(window, new Event('resize'));
  rerender(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  const overflow = screen.getByRole('button', { name: 'More actions' });
  overflow.focus();
  expect(overflow).toHaveFocus();
  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual(['Settings', 'View', 'About']);
});
