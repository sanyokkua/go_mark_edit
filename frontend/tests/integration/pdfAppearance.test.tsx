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

async function openExportGroup(): Promise<{ dialog: HTMLElement; group: HTMLElement }> {
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Export' }));
    return { dialog, group: within(dialog).getByRole('radiogroup', { name: 'PDF appearance' }) };
}

it('shows Styled selected and sends clean when Clean is chosen in the dialog', async () => {
    renderHarness();
    const { group } = await openExportGroup();
    expect(within(group).getByRole('radio', { name: 'Styled' })).toBeChecked();

    fireEvent.click(within(group).getByRole('radio', { name: 'Clean' }));

    await waitFor(() =>
        expect(updateAppearance).toHaveBeenCalledWith({
            defaultOpenMode: 'editor',
            readingWidth: 'page',
            pdfAppearance: 'clean',
            mode: 'auto',
            theme: 'material',
        }),
    );
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Clean' })).toBeChecked());
});

it('shows the stored Clean choice in the dialog after startup', async () => {
    (settingsAdapter.getSettings as jest.Mock).mockResolvedValueOnce({
        appearance: {
            defaultOpenMode: 'editor',
            readingWidth: 'page',
            pdfAppearance: 'clean',
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
    });
    renderHarness();
    const { group } = await openExportGroup();
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Clean' })).toBeChecked());
});

it('is reachable by keyboard in the dialog and restores Styled on Reset appearance', async () => {
    renderHarness();
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const sections = within(dialog).getByRole('tab', { name: 'Appearance' });
    sections.focus();
    fireEvent.keyDown(sections, { key: 'End' });
    expect(within(dialog).getByRole('tab', { name: 'Export' })).toHaveAttribute('aria-selected', 'true');
    const group = within(dialog).getByRole('radiogroup', { name: 'PDF appearance' });
    const styled = within(group).getByRole('radio', { name: 'Styled' });
    expect(styled).toBeChecked();

    styled.focus();
    fireEvent.keyDown(styled, { key: 'ArrowRight' });
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Clean' })).toBeChecked());
    expect(updateAppearance).toHaveBeenLastCalledWith({
        defaultOpenMode: 'editor',
        readingWidth: 'page',
        pdfAppearance: 'clean',
        mode: 'auto',
        theme: 'material',
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    const reopened = await openMenu();
    fireEvent.click(within(reopened).getByRole('menuitem', { name: /All settings/u }));

    const dialogAgain = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(dialogAgain).getByRole('button', { name: 'Reset appearance' }));
    fireEvent.click(within(dialogAgain).getByRole('tab', { name: 'Export' }));
    const groupAgain = within(dialogAgain).getByRole('radiogroup', { name: 'PDF appearance' });
    await waitFor(() => expect(within(groupAgain).getByRole('radio', { name: 'Styled' })).toBeChecked());
});
