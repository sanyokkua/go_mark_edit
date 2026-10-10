import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';

import { settingsAdapter } from '../../src/logic/adapter';
import { useEditorSettings } from '../../src/logic/settings/editorSettings';
import { store } from '../../src/logic/store';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { acknowledgeMarkdownSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import AppearanceControls from '../../src/ui/widgets/AppearanceControls';
import { useAppearanceSettings } from '../../src/ui/widgets/appearanceSettingsContext';
import SettingsMenu from '../../src/ui/widgets/Menubar/SettingsMenu';

jest.mock('../../src/logic/adapter', () => ({
    settingsAdapter: {
        getSettings: jest.fn(async () => ({
            appearance: {
                defaultOpenMode: 'editor',
                readingWidth: 'page',
                pdfAppearance: 'styled',
                mode: 'auto',
                theme: 'material',
            },
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

const updateMarkdown = settingsAdapter.updateMarkdown as jest.MockedFunction<typeof settingsAdapter.updateMarkdown>;

function Menu(): React.JSX.Element {
    const { appearance, onModeChange, onOpenAppearance, onThemeChange } = useAppearanceSettings();
    const { fileSettings, markdownSettings, updateMarkdown: writeMarkdown } = useEditorSettings();
    return (
        <SettingsMenu
            fileSettings={fileSettings}
            markdownSettings={markdownSettings}
            mode={appearance.mode}
            onMarkdownSettingsChange={(patch): void => {
                void writeMarkdown(patch).catch((): void => undefined);
            }}
            onModeChange={onModeChange}
            onOpenAppearance={onOpenAppearance}
            onThemeChange={onThemeChange}
            theme={appearance.theme}
        />
    );
}

beforeEach((): void => {
    store.dispatch(resetSettingsProjection());
    store.dispatch(resetNotifications());
    store.dispatch(
        acknowledgeMarkdownSettings({
            bulletMarker: '-',
            emphasisMarker: '*',
            formatOnSave: false,
            headingStyle: 'atx',
            lintOnSave: false,
            standard: 'gfm',
        }),
    );
    updateMarkdown.mockClear();
});

async function openMenu(): Promise<HTMLElement> {
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    return screen.getByRole('menu', { name: 'Settings menu' });
}

async function popupFormatOnSave(menu: HTMLElement): Promise<HTMLElement> {
    const row = within(menu).getByRole('menuitemcheckbox', { name: 'Format on save' });
    await waitFor(() => expect(row).toBeEnabled());
    return row;
}

it('keeps Format on save in sync between the Settings popup and the Settings dialog', async () => {
    rtlRender(
        <Provider store={store}>
            <AppearanceControls>
                <Menu />
            </AppearanceControls>
        </Provider>,
    );

    // Popup -> dialog.
    const menu = await openMenu();
    const popupRow = await popupFormatOnSave(menu);
    expect(popupRow).not.toBeChecked();
    fireEvent.click(popupRow);
    await waitFor(() => expect(updateMarkdown).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(popupRow).toBeChecked());

    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Markdown' }));
    const dialogSwitch = within(dialog).getByRole('switch', { name: 'Format on save' });
    expect(dialogSwitch).toBeChecked();

    // Dialog -> popup: the dialog's value is the one stored and shown in both.
    fireEvent.click(dialogSwitch);
    await waitFor(() => expect(updateMarkdown).toHaveBeenCalledTimes(2));
    expect(updateMarkdown).toHaveBeenLastCalledWith(expect.objectContaining({ formatOnSave: false }));
    await waitFor(() => expect(dialogSwitch).not.toBeChecked());
    expect(store.getState().settings.markdown?.formatOnSave).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    const reopened = await openMenu();
    expect(within(reopened).getByRole('menuitemcheckbox', { name: 'Format on save' })).not.toBeChecked();
});
