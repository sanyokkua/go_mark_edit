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
    const { appearance, onModeChange, onOpenAppearance, onReadingWidthChange, onThemeChange } = useAppearanceSettings();
    const { fileSettings, markdownSettings } = useEditorSettings();
    return (
        <SettingsMenu
            fileSettings={fileSettings}
            markdownSettings={markdownSettings}
            mode={appearance.mode}
            onModeChange={onModeChange}
            onOpenAppearance={onOpenAppearance}
            onReadingWidthChange={onReadingWidthChange}
            onThemeChange={onThemeChange}
            readingWidth={appearance.readingWidth}
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

it('shows Page selected and sends full when Full width is chosen in the menu', async () => {
    renderHarness();
    const menu = await openMenu();
    expect(within(menu).getByRole('menuitemradio', { name: 'Page' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Full width' }));

    await waitFor(() =>
        expect(updateAppearance).toHaveBeenCalledWith({
            defaultOpenMode: 'editor',
            readingWidth: 'full',
            pdfAppearance: 'styled',
            mode: 'auto',
            theme: 'material',
        }),
    );
    await waitFor(() =>
        expect(within(menu).getByRole('menuitemradio', { name: 'Full width' })).toHaveAttribute('aria-checked', 'true'),
    );
    expect(store.getState().settings.readingWidth).toBe('full');
});

it('keeps the dialog row and the menu in sync and restores Page on Reset appearance', async () => {
    renderHarness();
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Full width' }));
    await waitFor(() => expect(updateAppearance).toHaveBeenCalledTimes(1));

    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const group = within(dialog).getByRole('radiogroup', { name: 'Reading width' });
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Full width' })).toBeChecked());

    fireEvent.click(within(group).getByRole('radio', { name: 'Page' }));
    await waitFor(() =>
        expect(updateAppearance).toHaveBeenLastCalledWith({
            defaultOpenMode: 'editor',
            readingWidth: 'page',
            pdfAppearance: 'styled',
            mode: 'auto',
            theme: 'material',
        }),
    );
    fireEvent.click(within(group).getByRole('radio', { name: 'Full width' }));
    await waitFor(() => expect(store.getState().settings.readingWidth).toBe('full'));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset appearance' }));
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Page' })).toBeChecked());
    expect(store.getState().settings.readingWidth).toBe('page');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    const reopened = await openMenu();
    expect(within(reopened).getByRole('menuitemradio', { name: 'Page' })).toHaveAttribute('aria-checked', 'true');
});
