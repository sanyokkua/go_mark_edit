import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';

import { settingsAdapter } from '../../src/logic/adapter';
import { store, useAppSelector } from '../../src/logic/store';
import { hydrateSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { applyStatePatch } from '../../src/logic/store/appModelProjectionActions';
import {
    WorkspaceTreeCommandsContext,
    type WorkspaceTreeCommands,
} from '../../src/ui/widgets/WorkspaceTree/workspaceTreeCommands';
import HiddenFoldersToggle from '../../src/ui/widgets/WorkspaceTree/HiddenFoldersToggle';
import AppearanceControls from '../../src/ui/widgets/AppearanceControls';
import { useAppearanceSettings } from '../../src/ui/widgets/appearanceSettingsContext';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';

jest.mock('../../src/logic/adapter', () => ({
    settingsAdapter: {
        getSettings: jest.fn(async () => new Promise(() => undefined)),
        resetAppearance: jest.fn(async (): Promise<void> => undefined),
        updateAppearance: jest.fn(async (): Promise<void> => undefined),
        updateEditor: jest.fn(async (): Promise<void> => undefined),
        updateFile: jest.fn(async (): Promise<void> => undefined),
        updateMarkdown: jest.fn(async (): Promise<void> => undefined),
    },
}));

const updateEditor = settingsAdapter.updateEditor as jest.MockedFunction<typeof settingsAdapter.updateEditor>;
const updateFile = settingsAdapter.updateFile as jest.MockedFunction<typeof settingsAdapter.updateFile>;

function Opener(): React.JSX.Element {
    const { onOpenAppearance } = useAppearanceSettings();
    return (
        <button type="button" onClick={(event): void => onOpenAppearance(event.currentTarget)}>
            Open settings
        </button>
    );
}

function renderHarness(): void {
    rtlRender(
        <Provider store={store}>
            <AppearanceControls>
                <Opener />
            </AppearanceControls>
        </Provider>,
    );
}

function openDialog(): HTMLElement {
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    return screen.getByRole('dialog', { name: 'Settings' });
}

const originalWidth = window.innerWidth;

beforeEach((): void => {
    store.dispatch(resetSettingsProjection());
    store.dispatch(resetNotifications());
    store.dispatch(hydrateSettings(loadedMarkdownSettings));
    updateEditor.mockClear();
    updateFile.mockClear();
});

afterEach((): void => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
});

it('opens on Appearance with exactly the five sections in order', () => {
    renderHarness();
    const dialog = openDialog();

    expect(
        within(dialog)
            .getAllByRole('tab')
            .map((tab) => tab.textContent),
    ).toEqual(['Appearance', 'Editor', 'Markdown', 'Workspace', 'Export']);
    expect(within(dialog).getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByRole('tabpanel', { name: 'Appearance' })).toBeVisible();
});

it.each([1280, 375])('moves between sections with the keyboard and Tab enters the rows at width %i', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    renderHarness();
    const dialog = openDialog();
    const appearance = within(dialog).getByRole('tab', { name: 'Appearance' });
    expect(appearance).toHaveFocus();

    fireEvent.keyDown(appearance, { key: width > 500 ? 'ArrowDown' : 'ArrowRight' });
    fireEvent.keyDown(within(dialog).getByRole('tab', { name: 'Editor' }), { key: 'ArrowDown' });
    expect(within(dialog).getByRole('tab', { name: 'Markdown' })).toHaveFocus();
    expect(within(dialog).getByRole('tabpanel', { name: 'Markdown' })).toBeVisible();

    fireEvent.keyDown(within(dialog).getByRole('tab', { name: 'Markdown' }), { key: 'Home' });
    expect(within(dialog).getByRole('tab', { name: 'Appearance' })).toHaveFocus();

    fireEvent.keyDown(within(dialog).getByRole('tab', { name: 'Appearance' }), { key: 'Tab' });
    expect(within(dialog).getByRole('radio', { name: 'Material' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(within(dialog).getByRole('tab', { name: 'Appearance' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
});

it('places the section list before the rows in the document order', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    renderHarness();
    const dialog = openDialog();
    const tablist = within(dialog).getByRole('tablist');
    const panel = within(dialog).getByRole('tabpanel');
    expect(tablist.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('shows the stored Editor values and writes each change through the editor writers', async () => {
    renderHarness();
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Editor' }));

    expect(within(dialog).getByRole('switch', { name: 'Autosave' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('switch', { name: 'Line numbers' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('switch', { name: 'Word wrap' })).toHaveAttribute('aria-checked', 'false');
    expect(within(dialog).getByRole('switch', { name: 'Scroll sync' })).toHaveAttribute('aria-checked', 'true');
    const fontSize = within(dialog).getByRole('combobox', { name: 'Font size' });
    expect(fontSize).toHaveValue('14');
    expect(
        within(fontSize)
            .getAllByRole('option')
            .map((option) => option.textContent),
    ).toEqual(['13 px', '14 px', '16 px']);

    fireEvent.click(within(dialog).getByRole('switch', { name: 'Word wrap' }));
    await waitFor(() => expect(store.getState().settings.editor.wordWrap).toBe(true));
    expect(updateEditor).toHaveBeenLastCalledWith({
        fontSize: 14,
        lineNumbers: true,
        scrollSync: true,
        wordWrap: true,
    });
    expect(within(dialog).getByRole('switch', { name: 'Word wrap' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.change(fontSize, { target: { value: '16' } });
    await waitFor(() => expect(store.getState().settings.editor.fontSize).toBe(16));
    expect(updateEditor).toHaveBeenLastCalledWith({
        fontSize: 16,
        lineNumbers: true,
        scrollSync: true,
        wordWrap: true,
    });

    fireEvent.click(within(dialog).getByRole('switch', { name: 'Autosave' }));
    await waitFor(() => expect(store.getState().settings.file.autosave).toBe(false));
    expect(updateFile).toHaveBeenLastCalledWith({ autosave: false });
});

it('toggles Word wrap with Space on the focused switch', async () => {
    renderHarness();
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Editor' }));
    const wrap = within(dialog).getByRole('switch', { name: 'Word wrap' });
    wrap.focus();

    fireEvent.keyDown(wrap, { key: ' ' });

    await waitFor(() => expect(wrap).toHaveAttribute('aria-checked', 'true'));
});

it('disables the Markdown controls while the Markdown settings are loading', () => {
    store.dispatch(resetSettingsProjection());
    renderHarness();
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Markdown' }));

    const panel = within(dialog).getByRole('tabpanel', { name: 'Markdown' });
    expect(within(panel).getByText('Markdown settings are loading.')).toBeVisible();
    for (const control of [...within(panel).getAllByRole('radio'), ...within(panel).getAllByRole('switch')]) {
        expect(control).toBeDisabled();
    }
});

it.each([
    [
        'the Close button',
        (dialog: HTMLElement): void => void fireEvent.click(within(dialog).getByRole('button', { name: 'Close' })),
    ],
    ['Escape', (): void => void fireEvent.keyDown(document, { key: 'Escape' })],
    ['the backdrop', (): void => void fireEvent.pointerDown(screen.getByTestId('modal-backdrop'))],
])('closes with %s and returns focus to the opener', async (_name, close) => {
    renderHarness();
    const opener = screen.getByRole('button', { name: 'Open settings' });
    opener.focus();
    const dialog = openDialog();

    act((): void => close(dialog));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
});

describe('Show hidden folders shared with the folder tree toggle', () => {
    let revision = 100;

    // Stands in for the backend: it publishes the preference in the UI layout and, when a folder is open, in the workspace.
    const commands: WorkspaceTreeCommands = {
        onOpenFolder: (): void => undefined,
        onCloseFolder: (): void => undefined,
        onRefreshWorkspace: (): void => undefined,
        onOpenTreeFile: async (): Promise<undefined> => undefined,
        onSetWorkspaceHiddenFolders: (show: boolean): void => {
            revision += 1;
            const snapshot = store.getState().workspace.snapshot;
            store.dispatch(
                applyStatePatch({
                    revision,
                    orderedDocumentIds: [],
                    ui: { showHiddenFolders: show },
                    ...(snapshot === null ? {} : { workspace: { ...snapshot, showHiddenFolders: show } }),
                }),
            );
        },
    };

    function TreeToggle(): React.JSX.Element {
        const pressed = useAppSelector((state) => state.workspace.snapshot?.showHiddenFolders ?? false);
        return <HiddenFoldersToggle pressed={pressed} onChange={commands.onSetWorkspaceHiddenFolders} />;
    }

    function renderShared(): void {
        rtlRender(
            <Provider store={store}>
                <WorkspaceTreeCommandsContext.Provider value={commands}>
                    <AppearanceControls>
                        <Opener />
                        <TreeToggle />
                    </AppearanceControls>
                </WorkspaceTreeCommandsContext.Provider>
            </Provider>,
        );
    }

    function openWorkspaceSection(): HTMLElement {
        const dialog = openDialog();
        fireEvent.click(within(dialog).getByRole('tab', { name: 'Workspace' }));
        return within(dialog).getByRole('tabpanel', { name: 'Workspace' });
    }

    it('turns the preference on with no folder open and reflects a patch published elsewhere', async () => {
        revision += 1;
        store.dispatch(applyStatePatch({ revision, orderedDocumentIds: [], ui: { showHiddenFolders: false } }));
        renderShared();
        const toggle = within(openWorkspaceSection()).getByRole('switch', { name: 'Show hidden folders' });
        expect(toggle).toBeEnabled();
        expect(toggle).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(toggle);
        await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
        expect(store.getState().ui.layout.showHiddenFolders).toBe(true);

        act((): void => {
            revision += 1;
            store.dispatch(applyStatePatch({ revision, orderedDocumentIds: [], ui: { showHiddenFolders: false } }));
        });
        expect(toggle).toHaveAttribute('aria-checked', 'false');
    });

    it('keeps the tree toggle and the dialog switch in step in both directions', async () => {
        revision += 1;
        store.dispatch(
            applyStatePatch({
                revision,
                orderedDocumentIds: [],
                ui: { showHiddenFolders: false },
                workspace: {
                    rootPath: '/notes',
                    rootName: 'notes',
                    root: { path: '/notes', name: 'notes', isDir: true, unreadable: false },
                    totalEntries: 1,
                    truncated: false,
                    unavailable: false,
                    filterSuffixes: [],
                    showHiddenFolders: false,
                },
            }),
        );
        renderShared();
        const treeToggle = screen.getByRole('button', { name: 'Show hidden folders' });
        expect(treeToggle).toHaveAttribute('aria-pressed', 'false');
        const dialogSwitch = within(openWorkspaceSection()).getByRole('switch', { name: 'Show hidden folders' });

        fireEvent.click(dialogSwitch);
        await waitFor(() => expect(treeToggle).toHaveAttribute('aria-pressed', 'true'));
        expect(dialogSwitch).toHaveAttribute('aria-checked', 'true');

        fireEvent.click(treeToggle);
        await waitFor(() => expect(dialogSwitch).toHaveAttribute('aria-checked', 'false'));
        expect(treeToggle).toHaveAttribute('aria-pressed', 'false');
    });
});
