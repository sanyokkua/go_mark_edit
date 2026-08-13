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
import type { DocumentMetadata } from '../../logic/store/appModelTypes';
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

const identityDocument: DocumentMetadata = {
  documentId: 'document-1',
  title: 'notes.md',
  path: '/Users/test/projects/notes.md',
  displayName: 'notes.md',
  parentName: 'projects',
  dirty: true,
  encoding: 'utf-8',
  lineEnding: 'lf',
  wordCount: 1,
  status: 'unsaved-changes',
  view: {
    arrangement: 'editor',
    editorVisible: true,
    previewVisible: false,
    cursor: { line: 1, column: 1 },
    selection: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    },
    scroll: { editor: 0, preview: 0 },
  },
};

it('T033 keeps popup accelerators, group labels, separators, and viewport sizing tokenized', () => {
  const menuStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.module.css'),
    'utf8',
  );
  const menuSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.tsx'),
    'utf8',
  );
  /*
   * The popup surface, rows, accelerators and separators are owned once by
   * MenuSurface.module.css, so the shared assertions read that file. A rule that
   * still lives in a per-menu stylesheet is menu-specific by definition.
   */
  const surfaceStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/primitives/MenuSurface.module.css'),
    'utf8',
  );
  const settingsStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/SettingsMenu.module.css'),
    'utf8',
  );

  expect(menuStyles).toContain('min-width: var(--popup-min-width)');
  expect(menuStyles).toContain('font-size: var(--popup-accelerator-font-size)');
  expect(menuStyles).toContain('font-size: var(--popup-group-font-size)');
  expect(menuStyles).toContain('content: attr(data-shortcut)');
  expect(menuSource).toContain('menuDecoration(item.id)');
  expect(menuSource).toContain('data-shortcut={shortcutForMenuItem');
  expect(menuSource).toContain("'open-recent'");
  expect(surfaceStyles).toContain('min-inline-size: var(--popup-min-width)');
  expect(surfaceStyles).toContain('font-size: var(--popup-row-font-size)');
  expect(surfaceStyles).toContain('content: attr(data-shortcut)');
  expect(surfaceStyles).toContain('opacity: var(--disabled-opacity)');
  expect(settingsStyles).toContain('border-radius: var(--popup-radius)');
  expect(settingsStyles).toContain('min-inline-size: var(--popup-min-width)');
});

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
  ).toHaveAttribute('aria-disabled', 'true');
  expect(
    within(settingsMenu).getByRole('menuitem', { name: 'Editor' }),
  ).toHaveAttribute('aria-disabled', 'true');
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
    'Open File…',
    'Open Folder…',
    'release-notes.md',
    'spec-draft.md',
    // Binding source: mockup.html renders the reopen row as `↺ Reopen last
    // file`; the accessible name stays the plain action label.
    '↺ Reopen last file',
    'Save',
    'Save As…',
    'Export to PDF…',
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

it('T041 keeps document identity inside the top menu row without a vertical identity block', () => {
  render(
    <ShellMenuRow
      activeDocument={identityDocument}
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  const menu = screen.getByRole('navigation', {
    name: 'Application actions',
  });
  expect(
    within(menu).getByRole('heading', { name: 'projects / notes.md' }),
  ).toBeVisible();
  expect(within(menu).getByText('Unsaved changes')).toBeVisible();
  expect(screen.getAllByRole('heading')).toHaveLength(1);
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

it('T015 routes writable Save and Save As through the document dispatcher', async () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onSave = jest.fn(async () => undefined);
  const onSaveAs = jest.fn(async () => undefined);

  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      onSave={onSave}
      onSaveAs={onSaveAs}
      documentId="document-1"
      sessionDocumentId="document-1"
      writable
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  const fileMenu = screen.getByRole('menu', { name: 'File' });
  fireEvent.click(within(fileMenu).getByRole('menuitem', { name: 'Save' }));
  await waitFor(() =>
    expect(dispatch).toHaveBeenCalledWith(
      'save',
      expect.objectContaining({
        documentId: 'document-1',
        sessionDocumentId: 'document-1',
        writable: true,
      }),
    ),
  );
  expect(onSave).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save As' }));
  await waitFor(() => expect(onSaveAs).toHaveBeenCalledTimes(1));
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

it('T045 closes the narrow View menu after choosing an arrangement', async () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  const onArrangementChange = jest.fn();
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      toggleFullscreen={jest.fn(async () => true)}
      viewMenuProps={{
        ...viewMenuProps,
        arrangement: 'split',
        onArrangementChange,
      }}
    />,
  );

  const overflow = screen.getByRole('button', { name: 'More actions' });
  fireEvent.keyDown(overflow, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'View' }));
  const viewMenu = screen.getByRole('menu', { name: 'View options' });
  fireEvent.click(
    within(viewMenu).getByRole('menuitemradio', { name: 'Preview' }),
  );

  expect(onArrangementChange).toHaveBeenCalledWith('preview');
  await waitFor(() =>
    expect(screen.queryByRole('menu', { name: 'View options' })).toBeNull(),
  );
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

it('T045 keeps Radix shell popups in the Popper positioning flow', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.tsx'),
    'utf8',
  );
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.module.css'),
    'utf8',
  );

  // The overflow, File and About popups keep the Radix content class; the
  // recent-files submenu was replaced by the binding's inline recent rows.
  expect(shellSource.match(/styles\.radixOverflow/g)).toHaveLength(3);
  expect(shellStyles).toMatch(
    /\.radixOverflow\s*\{[^}]*position:\s*relative;/s,
  );
  expect(shellStyles).toContain(
    'var(--radix-dropdown-menu-content-available-height)',
  );
});

it('T070 anchors the File popup at the binding dropdown coordinates', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.tsx'),
    'utf8',
  );
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.module.css'),
    'utf8',
  );
  const tokens = readFileSync(
    resolve(process.cwd(), 'src/ui/styles/tokens.css'),
    'utf8',
  );

  // Binding source: mockup.html `#m-file{left:96px}` with `.dropdown{top:42px}`.
  expect(tokens).toContain('--file-menu-popup-left: 96px;');
  expect(tokens).toContain('--file-menu-popup-top: 42px;');
  expect(shellStyles).toMatch(
    /\.fileMenu\s*\{[^}]*inset:\s*var\(--file-menu-popup-top\) auto auto var\(--file-menu-popup-left\);/s,
  );
  expect(shellStyles).toMatch(/\.fileMenu\s*\{[^}]*position:\s*absolute;/s);
  expect(shellStyles).toMatch(/\.fileMenu\s*\{[^}]*width:\s*max-content;/s);
  // The popup is portalled into the frame so those coordinates resolve against
  // the same box the binding dropdown uses.
  expect(shellSource).toContain(
    '<DropdownMenu.Portal container={applicationFrame()}>',
  );
});

it('T045 keeps the narrow View anchor row-relative under glass blur', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.tsx'),
    'utf8',
  );

  expect(shellSource).toMatch(
    /const narrowMenuAnchor[\s\S]*?position:\s*'absolute'/s,
  );
  expect(shellSource).toContain('ref={menuRowRef}');
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

it('T033 keeps menu and popup geometry on the binding metric tokens', () => {
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.module.css'),
    'utf8',
  );

  expect(shellStyles).toContain('height: var(--menu-row-height)');
  expect(shellStyles).toContain('padding: var(--menu-trigger-padding)');
  expect(shellStyles).toContain('border-radius: var(--menu-trigger-radius)');
  expect(shellStyles).toContain('min-width: var(--popup-min-width)');
  expect(shellStyles).toContain('padding: var(--popup-padding)');
  expect(shellStyles).toContain('padding: var(--popup-row-padding)');
  expect(shellStyles).toContain('font-size: var(--popup-row-font-size)');
});

it('T041 keeps the in-app row on the binding titlebar geometry without native chrome', () => {
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/ShellMenuRow.module.css'),
    'utf8',
  );

  const rowRule = shellStyles.match(/\.row\s*\{([^}]*)\}/)?.[1];
  expect(rowRule).toBeDefined();
  expect(rowRule).toContain('height: var(--menu-row-height)');
  expect(rowRule).toContain('padding: var(--menu-row-padding)');
  expect(rowRule).toContain('gap: var(--menu-row-gap)');
  expect(rowRule).toContain('background: transparent');
  expect(rowRule).toContain('overflow: visible');
  expect(rowRule).toContain('white-space: normal');
  expect(rowRule).toContain('min-width: revert');
  expect(rowRule).toContain('min-height: revert');
});

it('T058 keeps the implemented desktop menubar grouped and keyboard-reachable', () => {
  render(
    <ShellMenuRow
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );

  const navigation = screen.getByRole('navigation', {
    name: 'Application actions',
  });
  const menu = navigation.querySelector('[data-shell-menu]');
  expect(menu).not.toBeNull();
  expect(
    within(menu as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['File', 'Settings', 'View', 'About']);
  expect(
    within(menu as HTMLElement)
      .getAllByRole('button')
      .every((button) => button.tabIndex >= 0),
  ).toBe(true);
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
  fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
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
