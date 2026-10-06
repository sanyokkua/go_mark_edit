import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';

import { settingsAdapter } from '../../../src/logic/adapter';
import { useEditorSettings } from '../../../src/logic/settings/editorSettings';
import { store } from '../../../src/logic/store';
import { hydrateSettings, resetSettingsProjection } from '../../../src/logic/store/settingsSlice';
import { resetNotifications } from '../../../src/logic/store/notificationsSlice';
import AppearanceControls from '../../../src/ui/widgets/AppearanceControls';
import { useAppearanceSettings } from '../../../src/ui/widgets/appearanceSettingsContext';
import SettingsMenu from '../../../src/ui/widgets/Menubar/SettingsMenu';

const render = (ui: Parameters<typeof rtlRender>[0]) => rtlRender(<Provider store={store}>{ui}</Provider>);

beforeEach((): void => {
    store.dispatch(resetSettingsProjection());
    store.dispatch(resetNotifications());
});

jest.mock('../../../src/logic/adapter', () => ({
    settingsAdapter: {
        getSettings: jest.fn(async () => ({
            appearance: {
                defaultOpenMode: 'editor',
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
        updateAppearance: jest.fn(async (): Promise<void> => undefined),
        updateMarkdown: jest.fn(async (): Promise<void> => undefined),
        resetAppearance: jest.fn(async (): Promise<void> => undefined),
    },
}));

const updateAppearance = settingsAdapter.updateAppearance as jest.MockedFunction<
    typeof settingsAdapter.updateAppearance
>;
const updateMarkdown = settingsAdapter.updateMarkdown as jest.MockedFunction<typeof settingsAdapter.updateMarkdown>;
const getSettings = settingsAdapter.getSettings as jest.MockedFunction<typeof settingsAdapter.getSettings>;
const resetAppearance = settingsAdapter.resetAppearance as jest.MockedFunction<typeof settingsAdapter.resetAppearance>;

function AppearanceMenu(): React.JSX.Element {
    const { appearance, onDefaultOpenModeChange, onModeChange, onOpenAppearance, onThemeChange } =
        useAppearanceSettings();
    const { fileSettings, markdownSettings, updateFile, updateMarkdown } = useEditorSettings();
    return (
        <SettingsMenu
            defaultOpenMode={appearance.defaultOpenMode as 'viewer' | 'editor'}
            onDefaultOpenModeChange={onDefaultOpenModeChange}
            fileSettings={fileSettings}
            markdownSettings={markdownSettings}
            mode={appearance.mode}
            onFileSettingsChange={(patch): void => {
                void updateFile(patch);
            }}
            onMarkdownSettingsChange={(patch): void => {
                void updateMarkdown(patch);
            }}
            onModeChange={onModeChange}
            onOpenAppearance={onOpenAppearance}
            onThemeChange={onThemeChange}
            theme={appearance.theme}
        />
    );
}

function AppearanceHarness(): React.JSX.Element {
    return (
        <AppearanceControls>
            <AppearanceMenu />
        </AppearanceControls>
    );
}

it('changes appearance from keyboard reachable controls after a successful write', async (): Promise<void> => {
    render(<AppearanceHarness />);

    const settings = await screen.findByRole('button', { name: 'Settings' });
    fireEvent.click(settings);
    expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Auto (system)' })).toBeChecked();
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));

    const dark = screen.getByRole('radio', { name: 'Dark' });
    dark.focus();
    fireEvent.keyDown(dark, { key: ' ' });

    await waitFor((): void => {
        expect(dark).toBeChecked();
    });
    expect(document.documentElement).toHaveAttribute('data-mode', 'dark');
    expect(updateAppearance).toHaveBeenCalledWith({
        defaultOpenMode: 'editor',
        mode: 'dark',
        theme: 'material',
    });
});

it('persists the selected standard and updates the acknowledged menu state', async () => {
    store.dispatch(hydrateSettings(await getSettings()));
    render(<AppearanceHarness />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(store.getState().settings.markdown?.standard).toBe('gfm'));
    for (const name of ['Minimal (CommonMark)', 'GFM', 'Full (+ math, alerts, admonitions)']) {
        const option = screen.getByRole('menuitemradio', {
            name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
        });
        expect(option).toBeVisible();
        await waitFor(() => expect(option).toHaveAttribute('aria-disabled', 'false'));
    }
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Full (+ math, alerts, admonitions)' }));
    await waitFor(() => expect(store.getState().settings.markdown?.standard).toBe('full'));
    expect(updateMarkdown).toHaveBeenCalledWith({
        bulletMarker: '-',
        emphasisMarker: '*',
        formatOnSave: false,
        headingStyle: 'atx',
        lintOnSave: false,
        standard: 'full',
    });
    expect(screen.queryByRole('combobox', { name: 'Markdown standard' })).not.toBeInTheDocument();
});

it('shows six Markdown preferences from hydration and applies each dialog change to the acknowledged group', async () => {
    store.dispatch(
        hydrateSettings({
            appearance: { defaultOpenMode: 'editor', mode: 'auto', theme: 'material' },
            contentPrivacy: { remotePolicy: 'ask' },
            markdown: {
                standard: 'full',
                bulletMarker: '-',
                emphasisMarker: '_',
                headingStyle: 'atx',
                formatOnSave: false,
                lintOnSave: true,
            },
        }),
    );
    render(<AppearanceHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dialog).getByRole('radio', { name: 'Full' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: '-' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: '_ _' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'ATX (#)' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Format on save' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Lint on save' })).toBeChecked();
    const change = async (control: HTMLElement, field: string, value: unknown): Promise<void> => {
        const previous = updateMarkdown.mock.calls.length;
        fireEvent.click(control);
        await waitFor(() => expect(store.getState().settings.markdown).toMatchObject({ [field]: value }));
        expect(updateMarkdown).toHaveBeenCalledTimes(previous + 1);
    };
    await change(within(dialog).getByRole('radio', { name: 'GFM' }), 'standard', 'gfm');
    await change(within(dialog).getByRole('radio', { name: /^\*$/u }), 'bulletMarker', '*');
    await change(within(dialog).getByRole('radio', { name: '* *' }), 'emphasisMarker', '*');
    await change(within(dialog).getByRole('radio', { name: 'Setext' }), 'headingStyle', 'setext');
    await change(within(dialog).getByRole('checkbox', { name: 'Format on save' }), 'formatOnSave', true);
    await change(within(dialog).getByRole('checkbox', { name: 'Lint on save' }), 'lintOnSave', false);
    expect(store.getState().settings.markdown).toEqual({
        standard: 'gfm',
        bulletMarker: '*',
        emphasisMarker: '*',
        headingStyle: 'setext',
        formatOnSave: true,
        lintOnSave: false,
    });
});

it('keeps the Markdown group unavailable before hydration and issues no write', async () => {
    render(<AppearanceHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    const markdown = screen.getByRole('region', { name: 'Markdown' });
    for (const radio of within(markdown).getAllByRole('radio')) {
        expect(radio).toBeDisabled();
        expect(radio).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(radio);
    }
    for (const toggle of within(markdown).getAllByRole('checkbox')) {
        expect(toggle).toBeDisabled();
        expect(toggle).not.toBeChecked();
        fireEvent.click(toggle);
    }
    expect(updateMarkdown).not.toHaveBeenCalled();
});

it('keeps acknowledged Markdown values on rejection and reports one error', async () => {
    store.dispatch(
        hydrateSettings({
            appearance: { defaultOpenMode: 'editor', mode: 'auto', theme: 'material' },
            contentPrivacy: { remotePolicy: 'ask' },
            markdown: {
                standard: 'full',
                bulletMarker: '-',
                emphasisMarker: '_',
                headingStyle: 'atx',
                formatOnSave: false,
                lintOnSave: true,
            },
        }),
    );
    updateMarkdown.mockRejectedValueOnce(new Error('write failed'));
    render(<AppearanceHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    const markdown = screen.getByRole('region', { name: 'Markdown' });
    fireEvent.click(within(markdown).getByRole('radio', { name: '+' }));
    await waitFor(() => expect(store.getState().notifications.items).toHaveLength(1));
    expect(within(markdown).getByRole('radio', { name: '-' })).toBeChecked();
    expect(store.getState().settings.markdown?.bulletMarker).toBe('-');
    expect(store.getState().notifications.items[0]?.severity).toBe('error');
});

it('uses arrows and Space to change described Markdown controls', async () => {
    store.dispatch(
        hydrateSettings({
            appearance: { defaultOpenMode: 'editor', mode: 'auto', theme: 'material' },
            contentPrivacy: { remotePolicy: 'ask' },
            markdown: {
                standard: 'full',
                bulletMarker: '-',
                emphasisMarker: '_',
                headingStyle: 'atx',
                formatOnSave: false,
                lintOnSave: true,
            },
        }),
    );
    render(<AppearanceHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    const markdown = screen.getByRole('region', { name: 'Markdown' });
    const bullet = within(markdown).getByRole('radiogroup', { name: 'Bullet marker' });
    expect(bullet).toHaveAccessibleDescription();
    const dash = within(bullet).getByRole('radio', { name: '-' });
    dash.focus();
    fireEvent.keyDown(dash, { key: 'ArrowRight' });
    await waitFor(() => expect(within(bullet).getByRole('radio', { name: '*' })).toBeChecked());
    const format = within(markdown).getByRole('checkbox', { name: 'Format on save' });
    expect(format).toHaveAccessibleDescription();
    format.focus();
    fireEvent.keyDown(format, { key: ' ' });
    fireEvent.click(format);
    await waitFor(() => expect(format).toBeChecked());
});

it('merges a dialog change with a pending popup change and keeps both surfaces synchronized', async () => {
    store.dispatch(
        hydrateSettings({
            appearance: { defaultOpenMode: 'editor', mode: 'auto', theme: 'material' },
            contentPrivacy: { remotePolicy: 'ask' },
            markdown: {
                standard: 'full',
                bulletMarker: '-',
                emphasisMarker: '_',
                headingStyle: 'atx',
                formatOnSave: false,
                lintOnSave: true,
            },
        }),
    );
    let releaseFirst: (() => void) | undefined;
    updateMarkdown.mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                releaseFirst = resolve;
            }),
    );
    render(<AppearanceHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    const popup = screen.getByRole('menu', { name: 'Settings menu' });
    fireEvent.click(within(popup).getByRole('menuitemcheckbox', { name: 'Format on save' }));
    await waitFor(() => expect(updateMarkdown).toHaveBeenCalledTimes(1));
    fireEvent.click(within(popup).getByRole('menuitem', { name: /All settings/u }));
    const markdown = screen.getByRole('region', { name: 'Markdown' });
    fireEvent.click(within(markdown).getByRole('radio', { name: '+' }));
    expect(store.getState().settings.markdown).toMatchObject({ formatOnSave: false, bulletMarker: '-' });
    releaseFirst?.();
    await waitFor(() =>
        expect(store.getState().settings.markdown).toMatchObject({ formatOnSave: true, bulletMarker: '+' }),
    );
    expect(updateMarkdown).toHaveBeenCalledTimes(2);
    expect(updateMarkdown).toHaveBeenLastCalledWith({
        standard: 'full',
        bulletMarker: '+',
        emphasisMarker: '_',
        headingStyle: 'atx',
        formatOnSave: true,
        lintOnSave: true,
    });
    expect(within(markdown).getByRole('radio', { name: '+' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(
        within(screen.getByRole('menu', { name: 'Settings menu' })).getByRole('menuitemcheckbox', {
            name: 'Format on save',
        }),
    ).toBeChecked();
});

it('leaves both controls and the root palette unchanged when persistence rejects', async (): Promise<void> => {
    updateAppearance.mockRejectedValueOnce(new Error('write failed'));
    render(<AppearanceHarness />);

    const settings = await screen.findByRole('button', { name: 'Settings' });
    fireEvent.click(settings);
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    fireEvent.click(screen.getByRole('radio', { name: 'Liquid Glass' }));

    await waitFor((): void => {
        expect(updateAppearance).toHaveBeenCalled();
    });
    expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-theme', 'material');
});

it('serializes rapid changes using the complete latest appearance choice', async (): Promise<void> => {
    let releaseFirstWrite: (() => void) | undefined;
    updateAppearance
        .mockImplementationOnce(
            () =>
                new Promise<void>((resolve): void => {
                    releaseFirstWrite = resolve;
                }),
        )
        .mockResolvedValueOnce();
    render(<AppearanceHarness />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Liquid Glass' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    await waitFor((): void => {
        expect(updateAppearance).toHaveBeenCalledWith({
            defaultOpenMode: 'editor',
            mode: 'auto',
            theme: 'glass',
        });
    });
    releaseFirstWrite?.();

    await waitFor((): void => {
        expect(updateAppearance).toHaveBeenLastCalledWith({
            defaultOpenMode: 'editor',
            mode: 'dark',
            theme: 'glass',
        });
        expect(document.documentElement).toHaveAttribute('data-theme', 'glass');
        expect(document.documentElement).toHaveAttribute('data-mode', 'dark');
    });
});

it('keeps an acknowledged appearance when the startup read resolves stale', async (): Promise<void> => {
    type Settings = Awaited<ReturnType<typeof settingsAdapter.getSettings>>;
    let resolveSettings: ((settings: Settings) => void) | undefined;
    const pendingSettings = new Promise<Settings>((resolve): void => {
        resolveSettings = resolve;
    });
    getSettings.mockReturnValueOnce(pendingSettings);
    render(<AppearanceHarness />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    await waitFor((): void => {
        expect(document.documentElement).toHaveAttribute('data-mode', 'dark');
        expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    });

    await act(async (): Promise<void> => {
        resolveSettings?.({
            appearance: {
                defaultOpenMode: 'editor',
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
        await pendingSettings;
    });

    expect(document.documentElement).toHaveAttribute('data-mode', 'dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
});

it('normalizes invalid persisted values before exposing controls or root attributes', async (): Promise<void> => {
    getSettings.mockResolvedValueOnce({
        appearance: {
            defaultOpenMode: 'editor',
            mode: 'future',
            theme: 'dracula',
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
    render(<AppearanceHarness />);

    await waitFor((): void => {
        expect(document.documentElement).toHaveAttribute('data-theme', 'material');
        expect(document.documentElement).toHaveAttribute('data-mode', 'light');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Auto (system)' })).toBeChecked();
});

it('owns one Auto listener, ignores a later system change while pinned, and stays silent on success', async (): Promise<void> => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const media = {
        matches: false,
        addEventListener: jest.fn((_type: string, listener: (event: { matches: boolean }) => void) =>
            listeners.add(listener),
        ),
        removeEventListener: jest.fn((_type: string, listener: (event: { matches: boolean }) => void) =>
            listeners.delete(listener),
        ),
    };
    const matchMedia = jest.fn(() => media);
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: matchMedia,
    });

    render(<AppearanceHarness />);
    await screen.findByRole('button', { name: 'Settings' });
    expect(listeners.size).toBe(1);

    for (const listener of listeners) listener({ matches: true });
    expect(document.documentElement).toHaveAttribute('data-mode', 'dark');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    await waitFor(() => expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function)));
    expect(document.documentElement).toHaveAttribute('data-mode', 'light');
    expect(listeners.size).toBe(0);
    expect(store.getState().notifications.items).toHaveLength(0);
});

it('updates synchronized quick and modal Appearance only after reset is acknowledged', async () => {
    getSettings.mockResolvedValueOnce({
        appearance: {
            defaultOpenMode: 'viewer',
            mode: 'dark',
            theme: 'minimal',
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
    let acknowledgeReset: (() => void) | undefined;
    resetAppearance.mockImplementationOnce(
        () =>
            new Promise<void>((resolve): void => {
                acknowledgeReset = resolve;
            }),
    );
    render(<AppearanceHarness />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(
        within(screen.getByRole('menu', { name: 'Settings menu' })).getByRole('radio', { name: 'Minimal' }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }));
    expect(
        within(screen.getByRole('region', { name: 'Appearance' })).getByRole('radio', { name: 'Minimal' }),
    ).toBeChecked();

    acknowledgeReset?.();
    await waitFor((): void => {
        expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked();
        // The full Settings dialog is now the visible surface; it keeps its own
        // catalogue wording for the same acknowledged Auto choice.
        expect(screen.getByRole('radio', { name: 'Follows system' })).toBeChecked();
    });
    expect(document.documentElement).toHaveAttribute('data-theme', 'material');
    expect(resetAppearance).toHaveBeenCalledTimes(1);
});

it('retains acknowledged Appearance when the transactional reset is rejected', async () => {
    getSettings.mockResolvedValueOnce({
        appearance: {
            defaultOpenMode: 'viewer',
            mode: 'dark',
            theme: 'minimal',
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
    resetAppearance.mockRejectedValueOnce(new Error('private database path'));
    render(<AppearanceHarness />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }));

    await waitFor((): void => expect(resetAppearance).toHaveBeenCalledTimes(1));
    expect(
        within(screen.getByRole('region', { name: 'Appearance' })).getByRole('radio', { name: 'Minimal' }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.body).not.toHaveTextContent('private database path');
});

it('does not broadcast a reset into another mounted acknowledged Appearance projection', async () => {
    const persisted: Awaited<ReturnType<typeof settingsAdapter.getSettings>> = {
        appearance: {
            defaultOpenMode: 'viewer',
            mode: 'dark',
            theme: 'minimal',
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
    };
    getSettings.mockResolvedValueOnce(persisted).mockResolvedValueOnce(persisted);
    const first = render(<AppearanceHarness />);
    const second = render(<AppearanceHarness />);

    fireEvent.click(await within(first.container).findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
    /*
     * portals every dialog to `document.body`, so the reset control is no
     * longer inside the projection's own container. Only the first projection's
     * dialog is open at this point, so an unscoped query still names exactly one
     * control — and the isolation this case is about is asserted below, on the
     * *second* projection's menu, which is still container-scoped.
     */
    fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked());

    fireEvent.click(await within(second.container).findByRole('button', { name: 'Settings' }));
    const secondMenu = screen.getByRole('menu', { name: 'Settings menu' });
    expect(within(secondMenu).getByRole('radio', { name: 'Minimal' })).toBeChecked();
    expect(within(secondMenu).getByRole('radio', { name: 'Dark' })).toBeChecked();
});
