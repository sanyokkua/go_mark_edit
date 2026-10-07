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
    const { appearance, onModeChange, onOpenAppearance, onPdfAppearanceChange, onThemeChange } =
        useAppearanceSettings();
    const { fileSettings, markdownSettings } = useEditorSettings();
    return (
        <SettingsMenu
            fileSettings={fileSettings}
            markdownSettings={markdownSettings}
            mode={appearance.mode}
            onModeChange={onModeChange}
            onOpenAppearance={onOpenAppearance}
            onPdfAppearanceChange={onPdfAppearanceChange}
            onThemeChange={onThemeChange}
            pdfAppearance={appearance.pdfAppearance}
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

it('shows Styled selected and sends clean when Clean is chosen in the menu', async () => {
    renderHarness();
    const menu = await openMenu();
    expect(within(menu).getByText('PDF appearance')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Styled' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Clean' }));

    await waitFor(() =>
        expect(updateAppearance).toHaveBeenCalledWith({
            defaultOpenMode: 'editor',
            readingWidth: 'page',
            pdfAppearance: 'clean',
            mode: 'auto',
            theme: 'material',
        }),
    );
    await waitFor(() =>
        expect(within(menu).getByRole('menuitemradio', { name: 'Clean' })).toHaveAttribute('aria-checked', 'true'),
    );
});

it('shows the stored Clean choice in the menu and the dialog after startup', async () => {
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
    const menu = await openMenu();
    await waitFor(() =>
        expect(within(menu).getByRole('menuitemradio', { name: 'Clean' })).toHaveAttribute('aria-checked', 'true'),
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    const group = within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('radiogroup', {
        name: 'PDF appearance',
    });
    expect(within(group).getByRole('radio', { name: 'Clean' })).toBeChecked();
});

it('keeps the dialog row and the menu in sync, is reachable by keyboard and restores Styled on Reset appearance', async () => {
    renderHarness();
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /All settings/u }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
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
    expect(within(reopened).getByRole('menuitemradio', { name: 'Clean' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(reopened).getByRole('menuitem', { name: /All settings/u }));

    const dialogAgain = screen.getByRole('dialog', { name: 'Settings' });
    const groupAgain = within(dialogAgain).getByRole('radiogroup', { name: 'PDF appearance' });
    fireEvent.click(within(dialogAgain).getByRole('button', { name: 'Reset appearance' }));
    await waitFor(() => expect(within(groupAgain).getByRole('radio', { name: 'Styled' })).toBeChecked());
    fireEvent.click(within(dialogAgain).getByRole('button', { name: 'Close' }));
    const afterReset = await openMenu();
    expect(within(afterReset).getByRole('menuitemradio', { name: 'Styled' })).toHaveAttribute('aria-checked', 'true');
});
