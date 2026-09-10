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

import { t } from '../../src/i18n';
import englishCatalog from '../../src/i18n/locales/en.json';
import * as actionDispatcher from '../../src/logic/actions/actionDispatcher';
import type { DocumentMetadata } from '../../src/logic/store/appModelTypes';
import type { SettingsMenuProps } from '../../src/ui/widgets/Menubar/SettingsMenu';
import Menubar from '../../src/ui/widgets/Menubar/Menubar';

jest.mock('../../src/logic/adapter', () => ({
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

function menuItemLabels(root: HTMLElement): string[] {
  return within(root)
    .getAllByRole('menuitem')
    .map(
      (item) =>
        item.querySelector('span')?.textContent ?? item.textContent ?? '',
    );
}

it('keeps popup accelerators, group labels, separators, and viewport sizing tokenized', () => {
  const menuStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.module.css'),
    'utf8',
  );
  const menuSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.tsx'),
    'utf8',
  );
  const popupStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/components/Popup/Popup.module.css'),
    'utf8',
  );
  const menuItemStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/components/MenuItem/MenuItem.module.css'),
    'utf8',
  );
  const settingsStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/SettingsMenu.module.css'),
    'utf8',
  );

  expect(menuStyles).toContain('height: var(--menu-row-height)');
  expect(menuSource).toContain('menuDecoration(item.id)');
  expect(menuSource).toContain('accelerator={shortcutForMenuItem');
  expect(menuSource).toContain("'open-recent'");
  expect(popupStyles).toContain('min-inline-size: var(--popup-min-width)');
  expect(popupStyles).toContain('border-radius: var(--popup-radius)');
  expect(popupStyles).toContain('box-shadow: var(--win-shadow)');
  expect(popupStyles).toContain(
    'box-shadow: var(--win-shadow), var(--focus-ring)',
  );
  expect(menuItemStyles).toContain(
    'font-size: var(--popup-accelerator-font-size)',
  );
  expect(menuItemStyles).toContain('opacity: var(--disabled-opacity)');
  expect(menuItemStyles).toContain('.item[data-highlighted]');
  expect(settingsStyles).not.toContain(
    'min-inline-size: var(--popup-min-width)',
  );
});

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1024,
  });
});

/*
 * File, Settings, View and About had three trigger implementations between them:
 * Menubar's own for File and About, and one each inside SettingsMenu and
 * ViewMenu that this file then patched through `[data-settings-opener]` and
 * `[data-view-trigger]`. Only the first declared a hover rule, so File and About
 * lit up under the pointer while Settings and View sat inert; View also carried
 * an 8px radius against the binding's 7px, and Settings never opened on
 * ArrowDown.
 *
 * They now all render `PopupTrigger`. Asserted through the shared class name and
 * the shared contract rather than through computed colour, because jsdom applies
 * no stylesheet — what is provable here is that one owner draws all of them.
 */
it('draws every menubar trigger from one owner', () => {
  render(
    <Menubar
      modalOpen={false}
      onAbout={jest.fn()}
      settingsMenuProps={settingsMenuProps}
      toggleFullscreen={jest.fn(async () => true)}
      viewMenuProps={viewMenuProps}
    />,
  );

  const menu = screen.getByRole('navigation', { name: 'Application actions' });
  const triggers = ['File', 'Settings', 'View', 'About'].map((name) =>
    within(menu).getByRole('button', { name }),
  );

  expect(new Set(triggers.map((trigger) => trigger.className)).size).toBe(1);
  for (const trigger of triggers) {
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  }
});

it.each(['File', 'Settings', 'View', 'About'])(
  'opens the %s menu from ArrowDown like every other menubar trigger',
  (name) => {
    render(
      <Menubar
        modalOpen={false}
        onAbout={jest.fn()}
        settingsMenuProps={settingsMenuProps}
        toggleFullscreen={jest.fn(async () => true)}
        viewMenuProps={viewMenuProps}
      />,
    );

    const menu = screen.getByRole('navigation', {
      name: 'Application actions',
    });
    const trigger = within(menu).getByRole('button', { name });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
);

it('renders File, Settings, View, About in binding order with exact deferred inventories', async () => {
  const onAbout = jest.fn();
  render(
    <Menubar
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
  expect(menuItemLabels(screen.getByRole('menu', { name: 'File' }))).toEqual([
    'New File',
    'New Window',
    'Open File…',
    'Open Folder…',
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
  expect(
    screen.getByRole('menu', { name: 'About GoMarkEdit' }),
  ).toHaveAttribute('data-viewport-popup', 'about-menu');
  fireEvent.click(screen.getByRole('menuitem', { name: 'About GoMarkEdit' }));
  expect(onAbout).toHaveBeenCalledTimes(1);
});

it('keeps document identity inside the top menu row without a vertical identity block', () => {
  render(
    <Menubar
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

it('routes the available File New/Open controls through the lifecycle dispatcher', async () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onNewDocument = jest.fn(async () => undefined);
  const onOpenDocument = jest.fn(async () => undefined);

  render(
    <Menubar
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

it('routes writable Save and Save As through the document dispatcher', async () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onSave = jest.fn(async () => undefined);
  const onSaveAs = jest.fn(async () => undefined);

  render(
    <Menubar
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

it('moves the same ordered top-level actions into overflow at narrow width', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  const onAbout = jest.fn();
  render(
    <Menubar
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
    menuItemLabels(screen.getByRole('menu', { name: 'Application actions' })),
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

it('closes the narrow View menu after choosing an arrangement', async () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  const onArrangementChange = jest.fn();
  render(
    <Menubar
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

it('places the functional sidebar and deferred Assistant controls at the menu-row edge', () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onWorkspaceVisibilityChange = jest.fn();
  render(
    <Menubar
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

/*
 * . This case used to be `preserves the narrow Open Recent submenu
 * fixtures as deferred items`, and it asserted the defect: with no recent
 * files the submenu drew two disabled rows named `release-notes.md` and
 * `spec-draft.md`. Those are catalogue-backed (`file.recent.release`,
 * `file.recent.spec`) but they are not entries — they are invented filenames
 * standing in for data that does not exist, and requires the
 * first-run state to show the defined empty message instead. The case is
 * rewritten rather than deleted, because the narrow submenu still needs a test
 * and the empty state is what it should have been asserting.
 */
//   message when no recent files exist" clause; the six-entry cap, the
//   functional New/Open actions and the no-session-restore clause are proven by
//   Launcher.test.tsx and real-files-and-tabs.test.ts)
it('shows the defined empty message in the narrow Open Recent group', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  render(
    <Menubar
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
  expect(within(fileMenu).getByText('Open Recent')).toBeVisible();
  expect(within(fileMenu).getByText('No recent files yet.')).toBeVisible();
  expect(
    within(fileMenu).queryByRole('menuitem', { name: 'Open Recent' }),
  ).toBeNull();
  expect(within(fileMenu).queryByText('release-notes.md')).toBeNull();
  expect(within(fileMenu).queryByText('spec-draft.md')).toBeNull();
});

it('repositions a narrow File popup from the overflow anchor after a resize', async () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  render(
    <Menubar
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

it('delegates shell popup lifecycle and sizing to Popup', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.tsx'),
    'utf8',
  );
  const popupStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/components/Popup/Popup.module.css'),
    'utf8',
  );

  expect(shellSource).toContain('<Popup');
  expect(shellSource).toContain('onOpenChange={setFileOpen}');
  expect(shellSource).toContain('onOpenChange={setAboutOpen}');
  expect(shellSource).not.toContain('DropdownMenu');
  expect(popupStyles).toContain('position: absolute');
  expect(popupStyles).toContain('box-shadow: var(--win-shadow)');
});

it('anchors the File popup through the shared trigger contract', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.tsx'),
    'utf8',
  );
  expect(shellSource).toContain('ref={captureFileTrigger}');
  expect(shellSource).toContain('anchor={{ trigger: fileTrigger }}');
  expect(shellSource).toContain('data-viewport-popup="file-menu"');
  expect(shellSource).not.toContain('DropdownMenu.Portal');
});

it('keeps the narrow View popup anchored to the shared overflow trigger', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.tsx'),
    'utf8',
  );

  expect(shellSource).toContain('anchorRef={overflowTriggerRef}');
  expect(shellSource).toContain('showTrigger={false}');
  expect(shellSource).not.toContain('narrowMenuAnchor');
});

it('switches to the keyboard-reachable overflow only at the 375-pixel state', () => {
  const { rerender } = render(
    <Menubar
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
    <Menubar
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
    menuItemLabels(screen.getByRole('menu', { name: 'Application actions' })),
  ).toEqual(['File', 'Settings', 'View', 'About']);
});

it('keeps a localized short About trigger separate from the long catalogue label', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.tsx'),
    'utf8',
  );
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.module.css'),
    'utf8',
  );

  expect(shellSource).toContain("{t('shell.about')}");
  expect(shellSource).not.toContain(".replace(' GoMarkEdit', '')");
  expect(t('shell.about')).toBe('About');
  expect(t('action.about.label')).toBe('About GoMarkEdit');
  expect(shellStyles).toMatch(/text-overflow:\s*ellipsis/);
});

it('keeps menu and popup geometry on the shared metric tokens', () => {
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.module.css'),
    'utf8',
  );
  const popupStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/components/Popup/Popup.module.css'),
    'utf8',
  );
  const menuItemStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/components/MenuItem/MenuItem.module.css'),
    'utf8',
  );

  expect(shellStyles).toContain('height: var(--menu-row-height)');
  expect(popupStyles).toContain('padding: var(--popup-padding)');
  expect(popupStyles).toContain('border-radius: var(--popup-radius)');
  expect(menuItemStyles).toContain('padding: var(--popup-row-padding)');
  expect(menuItemStyles).toContain('font-size: var(--popup-row-font-size)');
});

it('keeps the in-app row on the binding titlebar geometry without native chrome', () => {
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.module.css'),
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

it('keeps the implemented desktop menubar grouped and keyboard-reachable', () => {
  render(
    <Menubar
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

it('registers each desktop menu label as a Popup trigger', () => {
  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.tsx'),
    'utf8',
  );

  expect(shellSource.match(/<PopupTrigger/g)).toHaveLength(3);
  expect(shellSource).not.toContain('DropdownMenu.Trigger');
});

it('dispatches Settings Appearance and About actions through the canonical route', async () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onAbout = jest.fn();
  const onOpenAppearance = jest.fn();
  render(
    <Menubar
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

it('gives View popup ownership after File yields to it', async () => {
  render(
    <Menubar
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

it('opens View from its menu-row pointer trigger and restores that trigger on Escape', async () => {
  render(
    <Menubar
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

it('makes the visible View control the Radix menu trigger', () => {
  render(
    <Menubar
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

/*
 * : the File menu advertises an accelerator beside every one of these rows,
 * and until this suite existed nothing asserted that pressing one did anything.
 * `actionRegistry.test.ts` proves the registry *declares* `Mod+N`, and
 * `useShellShortcuts.test.tsx` proves the hook dispatches actions handed to it
 * by a synthetic harness. Neither asks whether Menubar — the component
 * that both renders the accelerator text and installs the only global keydown
 * listener — passes the file actions to that hook. It did not.
 *
 * jsdom reports `navigator.platform === ''`, so `currentPlatform()` resolves to
 * 'linux' and `Mod` binds to ctrlKey. That is the same convention already used
 * by useShellShortcuts.test.tsx and DocumentTabs.test.tsx.
 */
interface FileAcceleratorCase {
  readonly actionId: string;
  readonly event: Partial<KeyboardEvent> & { key: string };
  readonly label: string;
  readonly prop:
    | 'onNewDocument'
    | 'onOpenDocument'
    | 'onSave'
    | 'onSaveAs'
    | 'onCloseDocument'
    | 'onReopenLastFile';
}

const fileAcceleratorCases: readonly FileAcceleratorCase[] = [
  {
    actionId: 'new-file',
    event: { code: 'KeyN', ctrlKey: true, key: 'n' },
    label: 'Mod+N',
    prop: 'onNewDocument',
  },
  {
    actionId: 'open-file',
    event: { code: 'KeyO', ctrlKey: true, key: 'o' },
    label: 'Mod+O',
    prop: 'onOpenDocument',
  },
  {
    actionId: 'save',
    event: { code: 'KeyS', ctrlKey: true, key: 's' },
    label: 'Mod+S',
    prop: 'onSave',
  },
  {
    actionId: 'save-as',
    event: { code: 'KeyS', ctrlKey: true, key: 'S', shiftKey: true },
    label: 'Mod+Shift+S',
    prop: 'onSaveAs',
  },
  {
    actionId: 'close-tab',
    event: { code: 'KeyW', ctrlKey: true, key: 'w' },
    label: 'Mod+W',
    prop: 'onCloseDocument',
  },
  {
    actionId: 'reopen',
    event: {
      altKey: true,
      code: 'KeyT',
      ctrlKey: true,
      key: 'T',
      shiftKey: true,
    },
    label: 'Mod+Shift+Alt+T',
    prop: 'onReopenLastFile',
  },
];

function renderMenuRowWithFileActions(
  shell: {
    modalOpen?: boolean;
    writable?: boolean;
    /*
     * `App.tsx` passes `onCloseDocument` as `undefined` whenever there is no
     * resolvable active document. That is the only asymmetry between the menu
     * row and the Mod+W accelerator, so the harness has to be able to express
     * it — existed because nothing could.
     */
    closeDocument?: boolean;
  } = {},
): Record<FileAcceleratorCase['prop'], jest.Mock> {
  const callbacks: Record<FileAcceleratorCase['prop'], jest.Mock> = {
    onCloseDocument: jest.fn(async () => undefined),
    onNewDocument: jest.fn(async () => undefined),
    onOpenDocument: jest.fn(async () => undefined),
    onReopenLastFile: jest.fn(async () => undefined),
    onSave: jest.fn(async () => undefined),
    onSaveAs: jest.fn(async () => undefined),
  };
  render(
    <Menubar
      modalOpen={shell.modalOpen ?? false}
      onAbout={jest.fn()}
      onCloseDocument={
        (shell.closeDocument ?? true) ? callbacks.onCloseDocument : undefined
      }
      onNewDocument={callbacks.onNewDocument}
      onOpenDocument={callbacks.onOpenDocument}
      onReopenLastFile={callbacks.onReopenLastFile}
      onSave={callbacks.onSave}
      onSaveAs={callbacks.onSaveAs}
      canReopenLastFile
      documentId="document-1"
      sessionDocumentId="document-1"
      writable={shell.writable ?? true}
      settingsMenuProps={settingsMenuProps}
      viewMenuProps={viewMenuProps}
    />,
  );
  return callbacks;
}

describe.each(fileAcceleratorCases)(
  'dispatches the advertised File accelerator $label',
  ({ actionId, event, prop }: FileAcceleratorCase) => {
    it(`runs ${actionId} when the key is pressed at the window`, async () => {
      const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
      const callbacks = renderMenuRowWithFileActions();

      const notPrevented = fireEvent.keyDown(window, event);

      await waitFor(() => expect(callbacks[prop]).toHaveBeenCalledTimes(1));
      expect(dispatch).toHaveBeenCalledWith(
        actionId,
        expect.objectContaining({ invoke: expect.any(Function) }),
      );
      /*
       * The accelerator must claim the keystroke. Leaving it unclaimed is how
       * the browser default would win on a surface that advertises the binding.
       */
      expect(notPrevented).toBe(false);
      dispatch.mockRestore();
    });
  },
);

it('leaves Save and Save As unclaimed on a document that is not writable', async () => {
  const callbacks = renderMenuRowWithFileActions({ writable: false });

  const saveNotPrevented = fireEvent.keyDown(window, {
    code: 'KeyS',
    ctrlKey: true,
    key: 's',
  });
  const saveAsNotPrevented = fireEvent.keyDown(window, {
    code: 'KeyS',
    ctrlKey: true,
    key: 'S',
    shiftKey: true,
  });

  expect(callbacks.onSave).not.toHaveBeenCalled();
  expect(callbacks.onSaveAs).not.toHaveBeenCalled();
  /*
   * Not merely "does nothing": the menu greys these rows out, so the keystroke
   * must pass through rather than be swallowed. `useShellShortcuts` calls
   * preventDefault() only after isAvailable() returns true, so a hardcoded
   * `true` there would silently eat the key on a read-only document.
   */
  expect(saveNotPrevented).toBe(true);
  expect(saveAsNotPrevented).toBe(true);
});

it('leaves every File accelerator inert while a modal is open', async () => {
  const callbacks = renderMenuRowWithFileActions({ modalOpen: true });

  for (const { event } of fileAcceleratorCases) {
    expect(fireEvent.keyDown(window, event)).toBe(true);
  }

  expect(callbacks.onNewDocument).not.toHaveBeenCalled();
  expect(callbacks.onOpenDocument).not.toHaveBeenCalled();
  expect(callbacks.onSave).not.toHaveBeenCalled();
  expect(callbacks.onSaveAs).not.toHaveBeenCalled();
  expect(callbacks.onCloseDocument).not.toHaveBeenCalled();
  expect(callbacks.onReopenLastFile).not.toHaveBeenCalled();
});

it('disables the File menu Close Tab row when no close callback is bound', () => {
  /*
   * Reproduced on the real binary 2026-08-15: closing the last tab drops to the
   * launcher, where `activeDocumentId` is null, so `App.tsx` passes
   * `onCloseDocument` as undefined. The row still rendered enabled — brighter
   * than Save and Save As beside it, which grey correctly — and its click was a
   * silent no-op. Availability has to come from whether the row can act.
   */
  renderMenuRowWithFileActions({ closeDocument: false });

  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  const row = within(screen.getByRole('menu', { name: 'File' })).getByRole(
    'menuitem',
    { name: 'Close Tab' },
  );

  // The same triple the parity harness reads, so the two instruments agree.
  expect(
    row.hasAttribute('disabled') ||
      row.getAttribute('aria-disabled') === 'true' ||
      row.getAttribute('data-disabled') === 'true',
  ).toBe(true);
});

it('leaves Mod+W unclaimed when no close callback is bound', () => {
  /*
   * Guard against a fix that greys the row by hardcoding availability:
   * `useShellShortcuts` calls preventDefault() only once `isAvailable()` is
   * true, so claiming the key while unable to act would swallow it instead of
   * letting it fall through to the host. fireEvent.keyDown returns false when
   * preventDefault was called.
   */
  const callbacks = renderMenuRowWithFileActions({ closeDocument: false });

  expect(
    fireEvent.keyDown(window, { code: 'KeyW', ctrlKey: true, key: 'w' }),
  ).toBe(true);
  expect(callbacks.onCloseDocument).not.toHaveBeenCalled();
});

it('closes the active document when the File menu Close Tab row is clicked', async () => {
  /*
   * The row rendered enabled and its click was a silent no-op: dispatchFileAction
   * had no `close-tab` arm, so `invoke` was undefined and it returned early.
   * Menubar had no close callback in its props at all — the same missing
   * prop the Mod+W accelerator needs.
   */
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const callbacks = renderMenuRowWithFileActions();

  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  const fileMenu = screen.getByRole('menu', { name: 'File' });
  fireEvent.click(
    within(fileMenu).getByRole('menuitem', { name: 'Close Tab' }),
  );

  await waitFor(() =>
    expect(callbacks.onCloseDocument).toHaveBeenCalledTimes(1),
  );
  expect(dispatch).toHaveBeenCalledWith(
    'close-tab',
    expect.objectContaining({ documentId: 'document-1' }),
  );
  dispatch.mockRestore();
});

/*
 * A German-length stand-in for the menubar labels. Roughly five times the
 * English string, which is past the worst real case and is the point: the row
 * must tolerate it rather than be tuned to one language's measurements.
 */
const LONG_LABELS: Readonly<Record<string, string>> = {
  'shell.file': 'Dateiverwaltungsbefehle und Dokumentenaktionen',
  // Settings and View draw their trigger label from the action registry
  // (`t(action('settings').labelKey)`), not from a `shell.*` key.
  'action.settings.label': 'Anwendungseinstellungen und Erscheinungsbild',
  'action.view.label': 'Ansichtsanordnung und Anzeigeoptionen',
  'shell.about': 'Informationen über diese Anwendung',
};

// derivation, roles and accessible names, focus visibility and modal focus
// containment, reduced motion and centralized tokens are proved by the other
// anchors across this file, FormattingToolbar.test.tsx, dialogs/ClosePrompt.test.tsx
// and SettingsMenu.test.tsx.)
//
// The catalogue object the shim hands `createTranslator` is the one this test
// mutates, so `t` really does return longer strings for the duration — this is
// a substituted translation, not a stubbed component.
//
// Two things have to hold and they pull in opposite directions. The complete
// label must survive as the accessible name, because a screen reader reads the
// name and not the ellipsis; and the row must not restructure itself because a
// translation grew, because the responsive contract moves controls into the
// overflow at 375 pixels and nowhere else. A row that switched to overflow when
// a label got long would be "tolerating" longer text by hiding it.
it('keeps every menubar action reachable and named in full under a much longer translation', () => {
  const catalogue = englishCatalog as unknown as Record<string, string>;
  const originals = new Map<string, string>();
  for (const [key, value] of Object.entries(LONG_LABELS)) {
    originals.set(key, catalogue[key] as string);
    catalogue[key] = value;
  }
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1280,
  });

  try {
    expect(t('shell.file')).toBe(LONG_LABELS['shell.file']);

    render(
      <Menubar
        modalOpen={false}
        onAbout={jest.fn()}
        settingsMenuProps={settingsMenuProps}
        toggleFullscreen={jest.fn(async () => true)}
        viewMenuProps={viewMenuProps}
      />,
    );

    const menu = screen.getByRole('navigation', {
      name: 'Application actions',
    });
    for (const key of Object.keys(LONG_LABELS)) {
      const trigger = within(menu).getByRole('button', {
        name: LONG_LABELS[key] as string,
      });
      // The complete translation is the accessible name; only the painted text
      // may be shortened.
      expect(trigger).toHaveAccessibleName(LONG_LABELS[key] as string);
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    }

    // Length alone must not restructure the row. The overflow control belongs
    // to the 375-pixel state, which 'switches to the keyboard-
    // reachable overflow only at the 375-pixel state' pins from the other side.
    expect(within(menu).queryByRole('button', { name: 'More' })).toBeNull();
    expect(document.querySelector('[data-shell-overflow]')).toBeNull();
  } finally {
    for (const [key, value] of originals) {
      catalogue[key] = value;
    }
  }
});

// real browser, which jsdom cannot measure: the shared trigger clips and
// ellipsises rather than growing the row, and the row's spacer may shrink to
// nothing so a long trigger cannot force horizontal overflow. Asserted as
// declared CSS because `*.module.css` is mapped to a style mock under Jest, so
// no computed style exists to read — the same technique the surrounding
// geometry tests in this file use.
it('clips a long menubar label instead of growing the row', () => {
  const triggerStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/components/Popup/Popup.module.css'),
    'utf8',
  );
  const shellStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/Menubar/Menubar.module.css'),
    'utf8',
  );

  const trigger = triggerStyles.match(/\.trigger\s*\{[^}]*\}/)?.[0];
  expect(trigger).toBeDefined();
  expect(trigger).toMatch(/overflow:\s*hidden/);
  expect(trigger).toMatch(/text-overflow:\s*ellipsis/);
  expect(trigger).toMatch(/white-space:\s*nowrap/);
  expect(trigger).toMatch(/max-width:\s*100%/);

  const spacer = shellStyles.match(/\.spacer\s*\{[^}]*\}/)?.[0];
  expect(spacer).toBeDefined();
  expect(spacer).toMatch(/min-width:\s*0/);

  // The row's own height stays on the binding token, so a taller translation
  // cannot push the mapped editor content downward.
  expect(shellStyles).toContain('height: var(--menu-row-height)');
});
