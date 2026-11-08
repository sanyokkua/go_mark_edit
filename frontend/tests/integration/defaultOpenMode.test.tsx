import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';

import { settingsAdapter } from '../../src/logic/adapter';
import { useEditorSettings } from '../../src/logic/settings/editorSettings';
import { store } from '../../src/logic/store';
import { resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import AppearanceControls from '../../src/ui/widgets/AppearanceControls';
import { useAppearanceSettings } from '../../src/ui/widgets/appearanceSettingsContext';
import SettingsMenu from '../../src/ui/widgets/Menubar/SettingsMenu';

jest.mock('../../src/logic/adapter', () => ({
    settingsAdapter: {
        getSettings: jest.fn(async () => ({
            appearance: { openMode: 'last', readingWidth: 'page', mode: 'auto', theme: 'material' },
            contentPrivacy: { remotePolicy: 'ask' },
            markdown: {
                bulletMarker: '-',
                emphasisMarker: '*',
                formatOnSave: false,
                headingStyle: 'atx',
                lintOnSave: false,
                standard: 'gfm',
            },
        })),
        resetAppearance: jest.fn(async (): Promise<void> => undefined),
        updateAppearance: jest.fn(async (): Promise<void> => undefined),
        updateMarkdown: jest.fn(async (): Promise<void> => undefined),
    },
}));

const updateAppearance = settingsAdapter.updateAppearance as jest.MockedFunction<
    typeof settingsAdapter.updateAppearance
>;

function Menu(): React.JSX.Element {
    const { appearance, onModeChange, onOpenAppearance, onThemeChange } = useAppearanceSettings();
    const { fileSettings, markdownSettings } = useEditorSettings();
    return (
        <SettingsMenu
            fileSettings={fileSettings}
            markdownSettings={markdownSettings}
            mode={appearance.mode}
            onModeChange={onModeChange}
            onOpenAppearance={onOpenAppearance}
            onThemeChange={onThemeChange}
            theme={appearance.theme}
        />
    );
}

function renderHarness(): void {
    rtlRender(
        <Provider store={store}>
            <AppearanceControls>
                <Menu />
            </AppearanceControls>
        </Provider>,
    );
}

beforeEach((): void => {
    store.dispatch(resetSettingsProjection());
    store.dispatch(resetNotifications());
    updateAppearance.mockClear();
});

async function openMenu(): Promise<HTMLElement> {
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    return screen.getByRole('menu', { name: 'Settings menu' });
}

async function openDialog(): Promise<HTMLElement> {
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    return screen.getByRole('dialog', { name: 'Settings' });
}

const choices = [
    ['Reading', 'reading'],
    ['Editor', 'editor'],
    ['Split', 'split'],
    ['Preview', 'preview'],
    ['Remember last used', 'last'],
] as const;

it.each(choices)('persists %s as the default open mode chosen in the dialog', async (label, value) => {
    renderHarness();
    const dialog = await openDialog();
    const select = within(dialog).getByRole('combobox', { name: 'Default open mode' });
    // Start from a different value so each choice is a real change.
    fireEvent.change(select, { target: { value: value === 'editor' ? 'split' : 'editor' } });
    await waitFor(() => expect(updateAppearance).toHaveBeenCalledTimes(1));
    updateAppearance.mockClear();

    fireEvent.change(select, { target: { value } });

    await waitFor(() =>
        expect(updateAppearance).toHaveBeenCalledWith({
            openMode: value,
            readingWidth: 'page',
            pdfAppearance: 'styled',
            mode: 'auto',
            theme: 'material',
        }),
    );
    await waitFor(() => expect(within(select).getByRole('option', { name: label, selected: true })).toBeVisible());
});

it('shows Remember last used initially and restores it when Reset appearance is activated', async () => {
    renderHarness();
    const dialog = await openDialog();
    const select = within(dialog).getByRole('combobox', { name: 'Default open mode' });
    await waitFor(() => expect(select).toHaveValue('last'));
    fireEvent.change(select, { target: { value: 'reading' } });
    await waitFor(() => expect(select).toHaveValue('reading'));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset appearance' }));

    await waitFor(() => expect(select).toHaveValue('last'));
});

it('treats an unknown stored open mode as Remember last used', async () => {
    (settingsAdapter.getSettings as jest.Mock).mockResolvedValueOnce({
        appearance: { openMode: 'viewer', readingWidth: 'page', mode: 'auto', theme: 'material' },
        contentPrivacy: { remotePolicy: 'ask' },
        markdown: {
            bulletMarker: '-',
            emphasisMarker: '*',
            formatOnSave: false,
            headingStyle: 'atx',
            lintOnSave: false,
            standard: 'gfm',
        },
    });
    renderHarness();
    const dialog = await openDialog();
    expect(within(dialog).getByRole('combobox', { name: 'Default open mode' })).toHaveValue('last');
});
