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
            appearance: { defaultOpenMode: 'editor', readingWidth: 'page', mode: 'auto', theme: 'material' },
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
    const { appearance, onDefaultOpenModeChange, onModeChange, onOpenAppearance, onThemeChange } =
        useAppearanceSettings();
    const { fileSettings, markdownSettings } = useEditorSettings();
    return (
        <SettingsMenu
            defaultOpenMode={appearance.defaultOpenMode as 'viewer' | 'editor'}
            fileSettings={fileSettings}
            markdownSettings={markdownSettings}
            mode={appearance.mode}
            onDefaultOpenModeChange={onDefaultOpenModeChange}
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

it('sends the viewer value when Reading (Viewer) is chosen in the menu', async () => {
    renderHarness();
    const menu = await openMenu();
    expect(within(menu).getByRole('menuitemradio', { name: 'Editor' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Reading (Viewer)' }));

    await waitFor(() =>
        expect(updateAppearance).toHaveBeenCalledWith({
            defaultOpenMode: 'viewer',
            readingWidth: 'page',
            mode: 'auto',
            theme: 'material',
        }),
    );
    await waitFor(() =>
        expect(within(menu).getByRole('menuitemradio', { name: 'Reading (Viewer)' })).toHaveAttribute(
            'aria-checked',
            'true',
        ),
    );
});

it('keeps the dialog row and the menu in sync in both directions', async () => {
    renderHarness();
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Reading (Viewer)' }));
    await waitFor(() => expect(updateAppearance).toHaveBeenCalledTimes(1));

    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const group = within(dialog).getByRole('radiogroup', { name: 'Default open mode' });
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Reading (Viewer)' })).toBeChecked());

    fireEvent.click(within(group).getByRole('radio', { name: 'Editor' }));
    await waitFor(() =>
        expect(updateAppearance).toHaveBeenLastCalledWith({
            defaultOpenMode: 'editor',
            readingWidth: 'page',
            mode: 'auto',
            theme: 'material',
        }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    const reopened = await openMenu();
    await waitFor(() =>
        expect(within(reopened).getByRole('menuitemradio', { name: 'Editor' })).toHaveAttribute('aria-checked', 'true'),
    );
});

it('restores Editor when Reset appearance is activated', async () => {
    renderHarness();
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Reading (Viewer)' }));
    await waitFor(() => expect(updateAppearance).toHaveBeenCalledTimes(1));

    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }));

    const group = within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('radiogroup', {
        name: 'Default open mode',
    });
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Editor' })).toBeChecked());
});
