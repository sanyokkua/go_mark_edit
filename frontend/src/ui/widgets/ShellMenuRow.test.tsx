import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { t } from '../../i18n';
import * as actionDispatcher from '../../logic/actions/actionDispatcher';
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

it('T018 renders File, Settings, View, About in binding order with exact deferred inventories', async () => {
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
  ).toEqual(['File', 'Settings', 'View', 'About']);

  fireEvent.click(within(menu).getByRole('button', { name: 'Settings' }));
  const settingsMenu = screen.getByRole('menu', { name: 'Settings menu' });
  expect(settingsMenu).toBeVisible();
  expect(settingsMenu).toHaveAttribute('data-viewport-popup', 'settings-menu');
  expect(
    within(settingsMenu).getByRole('menuitem', { name: 'Reading (Viewer)' }),
  ).toBeDisabled();
  expect(
    within(settingsMenu).getByRole('menuitem', { name: 'Editor' }),
  ).toBeDisabled();
  fireEvent.click(within(menu).getByRole('button', { name: 'Settings' }));

  fireEvent.keyDown(within(menu).getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });
  const viewMenu = await screen.findByRole('menu');
  expect(viewMenu).toBeVisible();
  expect(viewMenu).toHaveAttribute('data-viewport-popup', 'view-menu');
  fireEvent.keyDown(viewMenu, { key: 'Escape' });

  fireEvent.keyDown(within(menu).getByRole('button', { name: 'File' }), {
    key: 'ArrowDown',
  });
  expect(screen.getByRole('menu', { name: 'File' })).toHaveAttribute(
    'data-viewport-popup',
    'file-menu',
  );
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual([
    'New File',
    'New Window',
    'Open File',
    'Open Folder',
    'Open Recent',
    'Reopen last file / folder',
    'Save',
    'Save As',
    'Export to PDF',
    'Close Tab',
    'Exit',
  ]);
  fireEvent.keyDown(screen.getByRole('menu', { name: 'File' }), {
    key: 'Escape',
  });

  fireEvent.click(within(menu).getByRole('button', { name: 'About' }));
  expect(screen.getByRole('menu', { name: 'About' })).toHaveAttribute(
    'data-viewport-popup',
    'about-menu',
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'About GoMarkEdit' }));
  expect(onAbout).toHaveBeenCalledTimes(1);
});

it('T009 routes the available File New/Open controls through the lifecycle dispatcher', async () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onNewDocument = jest.fn(async () => undefined);
  const onOpenDocument = jest.fn(async () => undefined);

  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      onNewDocument={onNewDocument}
      onOpenDocument={onOpenDocument}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  const fileMenu = screen.getByRole('menu', { name: 'File' });
  expect(
    within(fileMenu).getByRole('menuitem', { name: 'New File' }),
  ).toBeEnabled();
  expect(
    within(fileMenu).getByRole('menuitem', { name: 'Open File' }),
  ).toBeEnabled();

  fireEvent.click(within(fileMenu).getByRole('menuitem', { name: 'New File' }));
  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith(
      'new-file',
      expect.objectContaining({
        applicationFocused: true,
        invoke: expect.any(Function),
      }),
    ),
  );
  expect(onNewDocument).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open File' }));
  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith(
      'open-file',
      expect.objectContaining({ applicationFocused: true }),
    ),
  );
  expect(onOpenDocument).toHaveBeenCalledTimes(1);
  dispatch.mockRestore();
});

it('T018 moves the same ordered top-level actions into overflow at narrow width', () => {
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
  ).toEqual(['File', 'Settings', 'View', 'About']);

  fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
  expect(screen.getByRole('menu', { name: 'Settings menu' })).toBeVisible();

  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'View' }));
  const viewMenu = screen.getByRole('menu');
  expect(viewMenu).toBeVisible();
  fireEvent.keyDown(viewMenu, { key: 'Escape' });

  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'About' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'About GoMarkEdit' }));
  expect(onAbout).toHaveBeenCalledTimes(1);
});

it('T091 places the functional sidebar and deferred Assistant controls at the menu-row edge', () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onWorkspaceVisibilityChange = jest.fn();
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={{
        ...viewMenuProps,
        arrangement: 'split',
        onArrangementChange: jest.fn(),
        onWorkspaceVisibilityChange,
        workspaceVisible: true,
      }}
    />,
  );

  const menu = screen.getByRole('navigation', {
    name: 'Application actions',
  });
  const controls = menu.querySelector('[data-menu-row-actions]');
  expect(controls).not.toBeNull();
  expect(
    within(controls as HTMLElement).getByRole('button', {
      name: 'Toggle Sidebar',
    }),
  ).toBeEnabled();
  expect(
    within(controls as HTMLElement).getByRole('button', {
      name: 'Toggle Assistant',
    }),
  ).toBeDisabled();
  fireEvent.click(
    within(controls as HTMLElement).getByRole('button', {
      name: 'Toggle Sidebar',
    }),
  );
  expect(dispatch).toHaveBeenCalledWith(
    'toggle-sidebar',
    expect.objectContaining({ invoke: expect.any(Function) }),
  );
  expect(onWorkspaceVisibilityChange).toHaveBeenCalledWith(false);
  dispatch.mockRestore();
});

it('T052 preserves the narrow Open Recent submenu fixtures as deferred items', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      toggleFullscreen={jest.fn(async () => true)}
      viewMenuProps={viewMenuProps}
    />,
  );

  const overflow = screen.getByRole('button', { name: 'More actions' });
  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));

  const fileMenu = screen.getByRole('menu', { name: 'File' });
  const recent = within(fileMenu).getByRole('group', { name: 'Open Recent' });
  expect(
    within(recent).getByRole('menuitem', { name: 'release-notes.md' }),
  ).toBeDisabled();
  expect(
    within(recent).getByRole('menuitem', { name: 'spec-draft.md' }),
  ).toBeDisabled();
});

it('T085 repositions a narrow File popup from the overflow anchor after a resize', async () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  const overflow = screen.getByRole('button', { name: 'More actions' });
  let bounds = new DOMRect(12, 8, 32, 28);
  Object.defineProperty(overflow, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect => bounds,
  });

  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
  const fileMenu = screen.getByRole('menu', { name: 'File' });
  expect(fileMenu).toHaveStyle({ left: '12px', top: '36px' });

  bounds = new DOMRect(24, 12, 32, 32);
  fireEvent(window, new Event('resize'));

  await waitFor(() =>
    expect(fileMenu).toHaveStyle({ left: '24px', top: '44px' }),
  );
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
  ).toEqual(['File', 'Settings', 'View', 'About']);
});

it('T060 keeps a localized short About trigger separate from the long catalogue label', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.tsx'),
    'utf8',
  );
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.module.css'),
    'utf8',
  );

  expect(shellSource).toContain("{t('shell.about')}");
  expect(shellSource).not.toContain(".replace(' GoMarkEdit', '')");
  expect(t('shell.about')).toBe('About');
  expect(t('action.about.label')).toBe('About GoMarkEdit');
  expect(shellStyles).toMatch(/text-overflow:\s*ellipsis/);
});

it('T089 registers each desktop menu label as a Radix popup anchor', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.tsx'),
    'utf8',
  );

  expect(shellSource.match(/<DropdownMenu\.Trigger asChild>/g)).toHaveLength(3);
});

it('T061 dispatches Settings Appearance and About actions through the canonical route', async () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onAbout = jest.fn();
  const onOpenAppearance = jest.fn();
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={onAbout}
      settingsMenuProps={{
        ...settingsMenuProps,
        onOpenAppearance,
      }}
      toggleFullscreen={jest.fn(async () => true)}
      viewMenuProps={viewMenuProps}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Appearance' }));
  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith(
      'appearance',
      expect.objectContaining({
        applicationFocused: true,
        invoke: expect.any(Function),
        modalOpen: false,
      }),
    ),
  );
  expect(onOpenAppearance).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'About' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'About GoMarkEdit' }));
  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith(
      'about',
      expect.objectContaining({
        applicationFocused: true,
        invoke: expect.any(Function),
        modalOpen: false,
      }),
    ),
  );
  expect(onAbout).toHaveBeenCalledTimes(1);
  dispatch.mockRestore();
});

it('T081 gives View popup ownership after File yields to it', async () => {
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  const file = screen.getByRole('button', { name: 'File' });
  const view = screen.getByRole('button', { name: 'View' });
  fireEvent.click(file);
  expect(screen.getByRole('menu', { name: 'File' })).toBeVisible();

  fireEvent.pointerDown(view);
  act(() => view.focus());
  fireEvent.keyDown(view, {
    key: 'ArrowDown',
  });
  expect(screen.queryByRole('menu', { name: 'File' })).not.toBeInTheDocument();
  const viewMenu = await screen.findByRole('menu');
  expect(viewMenu).toBeVisible();

  fireEvent.keyDown(viewMenu, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(view).toHaveFocus();
});

it('T089 opens View from its menu-row pointer trigger and restores that trigger on Escape', async () => {
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  const view = screen.getByRole('button', { name: 'View' });
  fireEvent.pointerDown(view);
  act(() => view.focus());
  fireEvent.click(view);

  const viewMenu = await screen.findByRole('menu', { name: 'View options' });
  expect(viewMenu).toBeVisible();
  fireEvent.keyDown(viewMenu, { key: 'Escape' });
  expect(view).toHaveFocus();
});

it('T093 makes the visible View control the Radix menu trigger', () => {
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  expect(screen.getByRole('button', { name: 'View' })).toHaveAttribute(
    'data-view-trigger',
  );
});
