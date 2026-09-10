import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ShellMenuRow from '../../src/ui/widgets/ShellMenuRow';

const settingsMenuProps = {
  mode: 'auto' as const,
  onModeChange: jest.fn(),
  onOpenAppearance: jest.fn(),
  onThemeChange: jest.fn(),
  theme: 'material' as const,
};

const viewMenuProps = {
  editorVisible: true,
  onEditorVisibilityChange: jest.fn(),
  onPreviewVisibilityChange: jest.fn(),
  previewVisible: true,
};

function enabledMenuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
    ),
  ).filter((item) => !item.hasAttribute('disabled'));
}

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1024,
  });
});

// Proves: FR-034
it.each([
  ['File', 'File', 'n', 'New File'],
  ['Settings', 'Settings menu', 'a', 'Autosave'],
  ['View', 'View options', 's', 'Show Editor'],
  ['About', 'About GoMarkEdit', 'a', 'About GoMarkEdit'],
] as const)(
  'keeps Arrow, Home, End, Escape, and type-ahead consistent in the %s family',
  async (triggerName, menuName, typeaheadKey, typeaheadLabel) => {
    render(
      <ShellMenuRow
        modalOpen={false}
        onAbout={jest.fn()}
        onCloseDocument={jest.fn()}
        onNewDocument={jest.fn()}
        onOpenDocument={jest.fn()}
        onQuit={jest.fn()}
        onReopenLastFile={jest.fn()}
        onSave={jest.fn()}
        onSaveAs={jest.fn()}
        writable
        canReopenLastFile
        settingsMenuProps={settingsMenuProps}
        toggleFullscreen={jest.fn(async () => true)}
        viewMenuProps={viewMenuProps}
      />,
    );

    const trigger = screen.getByRole('button', { name: triggerName });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = await screen.findByRole('menu', { name: menuName });
    const items = enabledMenuItems(menu);
    expect(items.length).toBeGreaterThan(1);

    fireEvent.keyDown(menu, { key: 'End' });
    expect(items.at(-1)).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: typeaheadKey });
    expect(
      items.find((item) => item.textContent?.trim().startsWith(typeaheadLabel)),
    ).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: menuName })).toBeNull(),
    );
    expect(trigger).toHaveFocus();
  },
);
