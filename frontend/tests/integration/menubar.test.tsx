import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Menubar from '../../src/ui/widgets/Menubar/Menubar';

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
        menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'),
    ).filter((item) => !item.hasAttribute('disabled'));
}

afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1024,
    });
});

it('shows an enabled New Window row and invokes its command', async () => {
    const onNewWindow = jest.fn(async () => undefined);
    render(
        <Menubar
            modalOpen={false}
            onAbout={jest.fn()}
            onNewWindow={onNewWindow}
            settingsMenuProps={settingsMenuProps}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    const row = screen.getByRole('menuitem', { name: 'New Window' });
    expect(row).toBeEnabled();
    fireEvent.click(row);
    await waitFor(() => expect(onNewWindow).toHaveBeenCalledTimes(1));
});

it.each([1024, 375])('shows ten recent names and clear confirmation at width %i', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    fireEvent(window, new Event('resize'));
    const refresh = jest.fn(async () => undefined);
    const clear = jest.fn(async () => undefined);
    const open = jest.fn(async () => undefined);
    const recentItems = Array.from({ length: 11 }, (_, index) => ({
        path: `/tmp/item-${index}${index === 0 ? '' : '.md'}`,
        kind: index === 0 ? ('folder' as const) : ('file' as const),
    }));
    render(
        <Menubar
            modalOpen={false}
            onAbout={jest.fn()}
            settingsMenuProps={settingsMenuProps}
            recentItems={recentItems}
            onRefreshRecentItems={refresh}
            onClearRecentItems={clear}
            onOpenRecentItem={open}
        />,
    );
    if (width < 500) {
        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
    } else {
        fireEvent.click(screen.getByRole('button', { name: 'File' }));
    }
    expect(refresh).toHaveBeenCalledTimes(1);
    const menu = await screen.findByRole('menu', { name: 'File' });
    expect(menu.querySelectorAll('[title^="/tmp/item-"]')).toHaveLength(10);
    expect(screen.queryByText('item-10.md')).toBeNull();
    expect(screen.getByTitle('/tmp/item-0')).toHaveTextContent('item-0');
    fireEvent.click(screen.getByTitle('/tmp/item-0'));
    expect(open).toHaveBeenCalledWith({ path: '/tmp/item-0', kind: 'folder' });
    if (width < 500) {
        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
    } else {
        fireEvent.click(screen.getByRole('button', { name: 'File' }));
    }
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear Recent…' }));
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Recent…' }));
    expect(clear).toHaveBeenCalledTimes(1);
});

it.each([
    ['File', 'File', 'n', 'New File'],
    ['Settings', 'Settings menu', 'a', 'Autosave'],
    ['View', 'View options', 's', 'Show Editor'],
    ['About', 'About GoMarkEdit', 'a', 'About GoMarkEdit'],
] as const)(
    'keeps Arrow, Home, End, Escape, and type-ahead consistent in the %s family',
    async (triggerName, menuName, typeaheadKey, typeaheadLabel) => {
        render(
            <Menubar
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
        expect(items.find((item) => item.textContent?.trim().startsWith(typeaheadLabel))).toHaveFocus();

        fireEvent.keyDown(menu, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('menu', { name: menuName })).toBeNull());
        expect(trigger).toHaveFocus();
    },
);
