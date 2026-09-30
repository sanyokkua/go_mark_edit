import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import catalogue from '../../src/i18n/locales/en.json';
import { currentPlatform, formatShortcut } from '../../src/logic/actions/shortcutRegistry';
import {
    getAction,
    getActionAvailability,
    type ActionAvailability,
    type ActionId,
} from '../../src/logic/actions/actionRegistry';
import SettingsMenu from '../../src/ui/widgets/Menubar/SettingsMenu';

jest.mock('../../src/logic/actions/actionRegistry', () => {
    const actual = jest.requireActual('../../src/logic/actions/actionRegistry');
    return {
        __esModule: true,
        ...actual,
        getAction: jest.fn(actual.getAction),
        getActionAvailability: jest.fn(actual.getActionAvailability),
    };
});

const actionMock = getAction as jest.MockedFunction<typeof getAction>;
const availabilityMock = getActionAvailability as jest.MockedFunction<typeof getActionAvailability>;

beforeEach(() => {
    actionMock.mockReset();
    actionMock.mockImplementation(
        jest.requireActual<typeof import('../../src/logic/actions/actionRegistry')>(
            '../../src/logic/actions/actionRegistry',
        ).getAction,
    );
    availabilityMock.mockImplementation(
        jest.requireActual<typeof import('../../src/logic/actions/actionRegistry')>(
            '../../src/logic/actions/actionRegistry',
        ).getActionAvailability,
    );
});

const catalogueValues = new Set(Object.values(catalogue as Record<string, string>));

const props = {
    mode: 'auto' as const,
    onModeChange: jest.fn(),
    onOpenAppearance: jest.fn(),
    onThemeChange: jest.fn(),
    theme: 'material' as const,
};

it('positions Settings as a portal menu and restores its trigger focus after dismissal', async () => {
    render(
        <>
            <button type="button">Outside</button>
            <SettingsMenu {...props} />
        </>,
    );
    const trigger = screen.getByRole('button', { name: 'Settings' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Settings menu' });
    expect(menu).toBeVisible();
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveAttribute('data-viewport-popup', 'settings-menu');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Settings menu' })).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu', { name: 'Settings menu' })).toBeNull();
});

it('renders the acknowledged autosave control and leaves deferred save actions unavailable', () => {
    const onFileSettingsChange = jest.fn();
    render(<SettingsMenu {...props} fileSettings={{ autosave: true }} onFileSettingsChange={onFileSettingsChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const autosave = screen.getByRole('checkbox', { name: 'Autosave' });
    expect(autosave).toBeChecked();
    fireEvent.click(autosave);
    expect(onFileSettingsChange).toHaveBeenCalledWith({ autosave: false });
    // `format-on-save` and `lint-on-save` are `laterDeferred` in the action
    // registry, which is the canonical authority for availability. The previous
    // assertion said the opposite of this test's own name, and of the registry.
    expect(screen.getByRole('checkbox', { name: 'Format on save' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Lint on save' })).toBeDisabled();
});

it('shows no invented Markdown selection or checked save value before hydration', () => {
    const { rerender } = render(<SettingsMenu {...props} onMarkdownSettingsChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const format = screen.getByRole('checkbox', { name: 'Format on save' });
    const lint = screen.getByRole('checkbox', { name: 'Lint on save' });
    expect(format).toBeDisabled();
    expect(format).not.toBeChecked();
    expect(lint).toBeDisabled();
    expect(lint).not.toBeChecked();
    const menu = screen.getByRole('menu', { name: 'Settings menu' });
    expect(menu.querySelectorAll('[data-availability="enabled"][data-settings-row*="Markdown"]')).toHaveLength(0);

    rerender(
        <SettingsMenu
            {...props}
            markdownSettings={{
                bulletMarker: '+',
                emphasisMarker: '_',
                headingStyle: 'setext',
                standard: 'full',
                formatOnSave: true,
                lintOnSave: true,
            }}
            onMarkdownSettingsChange={jest.fn()}
        />,
    );
    expect(screen.getByRole('checkbox', { name: 'Format on save' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Lint on save' })).toBeChecked();
});

it('draws every visible Settings popup string from the catalogue', () => {
    render(
        <SettingsMenu
            {...props}
            fileSettings={{ autosave: true }}
            markdownSettings={{
                bulletMarker: '-',
                emphasisMarker: '_',
                formatOnSave: false,
                headingStyle: 'atx',
                lintOnSave: true,
                standard: 'gfm',
            }}
            onFileSettingsChange={jest.fn()}
            onMarkdownSettingsChange={jest.fn()}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const menu = screen.getByRole('menu', { name: 'Settings menu' });

    /*
     * Every rendered text node inside the popup must come from a declared source.
     * A hard-coded literal cannot survive this, because it appears in neither.
     *
     * adds the second source: an accelerator is derived from the action
     * registry through `formatShortcut`, not from the catalogue, precisely so it
     * follows the platform. Listing the derived value here keeps the no-literals
     * rule intact — a stray string still fails — while naming the registry as a
     * legitimate origin rather than exempting the row from the check.
     */
    const derivedAccelerators = new Set(
        ['settings']
            .map((id) => getAction(id as ActionId).shortcut)
            .filter((binding): binding is string => binding !== undefined)
            .map((binding) => formatShortcut(binding, currentPlatform())),
    );
    const renderedText = Array.from(menu.querySelectorAll('span, div'))
        .filter((element) => element.children.length === 0)
        .map((element) => element.textContent?.trim() ?? '')
        .filter((text) => text.length > 0 && text !== '✓');
    expect(renderedText.length).toBeGreaterThan(0);
    for (const text of renderedText) {
        expect([...catalogueValues, ...derivedAccelerators]).toContain(text);
    }

    // Accessible names are user-visible text and obey the same rule.
    const accessibleNames = Array.from(menu.querySelectorAll('[aria-label]'))
        .map((element) => element.getAttribute('aria-label') ?? '')
        .filter((name) => name.length > 0);
    expect(accessibleNames.length).toBeGreaterThan(0);
    for (const name of accessibleNames) {
        expect(catalogueValues).toContain(name);
    }
});

it('keeps the binding popup labels, roles, and acknowledged state', () => {
    const onMarkdownSettingsChange = jest.fn();
    render(
        <SettingsMenu
            {...props}
            fileSettings={{ autosave: false }}
            markdownSettings={{
                bulletMarker: '-',
                emphasisMarker: '_',
                formatOnSave: true,
                headingStyle: 'atx',
                lintOnSave: false,
                standard: 'minimal',
            }}
            onFileSettingsChange={jest.fn()}
            onMarkdownSettingsChange={onMarkdownSettingsChange}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const menu = screen.getByRole('menu', { name: 'Settings menu' });

    // The labels the design draws in the Settings popup.
    for (const label of [
        'Theme',
        'Appearance',
        'Auto (system)',
        'Light',
        'Dark',
        'Default open mode',
        'Reading (Viewer)',
        'Editor',
        'Markdown',
        'Minimal (CommonMark)',
        'GFM',
        'Full (+ math, alerts, admonitions)',
        'Autosave',
        'Format on save',
        'Lint on save',
        'All settings…',
        // : platform-derived, not a catalogue literal.
        formatShortcut(getAction('settings').shortcut as string, currentPlatform()),
    ]) {
        expect(menu).toHaveTextContent(label);
    }

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Autosave' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Format on save' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Lint on save' })).not.toBeChecked();

    // Format on save and Lint on save are registry-deferred in this feature, so
    // the real control renders its acknowledged state but performs no write.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lint on save' }));
    expect(onMarkdownSettingsChange).not.toHaveBeenCalled();
});

it('opens All settings from the keyboard and closes the popup', () => {
    const onOpenAppearance = jest.fn();
    render(<SettingsMenu {...props} onOpenAppearance={onOpenAppearance} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const allSettings = screen.getByRole('menuitem', { name: /All settings/u });
    fireEvent.keyDown(allSettings, { key: 'Enter' });
    expect(onOpenAppearance).toHaveBeenCalled();
    expect(screen.queryByRole('menu', { name: 'Settings menu' })).toBeNull();
});

/*
 * : the accelerator beside `All settings…` was a hardcoded catalogue string
 * (`settings.menu.allSettings.accelerator`, literally "Ctrl ,"), so it was
 * platform-blind and told a macOS user to press Ctrl when the key that works is
 * ⌘. Every other menu accelerator is derived from the action registry through
 * `formatShortcut` — see Menubar's `shortcutForMenuItem` — which is why
 * the File menu renders ⌘N correctly on the same host.
 *
 * The assertion is written against the registry rather than a literal so it
 * cannot drift from the binding that is actually dispatched: `useShellShortcuts`
 * matches on `getAction('settings').shortcut`, and this is the text advertising
 * it.
 */
it('advertises the Settings accelerator the platform actually dispatches', () => {
    render(<SettingsMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    const binding = getAction('settings').shortcut;
    expect(binding).toBe('Mod+,');

    const allSettings = screen.getByRole('menuitem', { name: /All settings/u });
    expect(allSettings.textContent).toContain(formatShortcut(binding as string, currentPlatform()));
});

it('keeps no hardcoded accelerator string in the catalogue', () => {
    /*
     * A literal left in the catalogue is the defect itself: it renders whatever
     * platform it was written for. Deleting the key is part of the fix, so this
     * fails while the string survives anywhere under i18n/locales.
     */
    expect(Object.keys(catalogue as Record<string, string>)).not.toContain('settings.menu.allSettings.accelerator');
});

/*
 * . `SettingsMenu` is where the availability-from-wiring defect was found
 * and where its residue survived: the Autosave row read
 * `onFileSettingsChange === undefined` with no registry term at all, and the
 * open-mode and Markdown-standard rows hardcoded `aria-disabled="true"`. All
 * three happen to *agree* with the registry today, which is exactly why the
 * defect is invisible without making the registry answer something different.
 * These cases replace the registry's answer and assert the rows follow it.
 */
function withRegistryAvailability(overrides: Partial<Record<ActionId, ActionAvailability>>): void {
    const real = jest.requireActual<typeof import('../../src/logic/actions/actionRegistry')>(
        '../../src/logic/actions/actionRegistry',
    ).getAction;
    actionMock.mockImplementation((id: ActionId) => {
        const entry = real(id);
        const availability = overrides[id];
        return availability === undefined ? entry : { ...entry, availability };
    });
    availabilityMock.mockImplementation((id: ActionId) => {
        const availability = overrides[id];
        return availability === undefined
            ? jest
                  .requireActual<typeof import('../../src/logic/actions/actionRegistry')>(
                      '../../src/logic/actions/actionRegistry',
                  )
                  .getActionAvailability(id)
            : availability?.kind === 'deferred'
              ? { kind: 'unavailable', reason: 'deferred' }
              : { kind: 'available' };
    });
}

/*
 * The five rows that report a stored value: the two default-open-mode options
 * and the three Markdown standards. Every one is drawn by a `.stateRow`.
 */
const STATE_ROW_LABELS = [
    'Reading (Viewer)',
    'Editor',
    'Minimal (CommonMark)',
    'GFM',
    'Full (+ math, alerts, admonitions)',
] as const;

function settingsRow(label: string): HTMLElement {
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-settings-row]')).find(
        (candidate) => candidate.dataset.settingsRow === label,
    );
    if (row === undefined) {
        throw new Error(
            `no settings row for ${label}; found ${Array.from(
                document.querySelectorAll<HTMLElement>('[data-settings-row]'),
            )
                .map((candidate) => candidate.dataset.settingsRow)
                .join(' | ')}`,
        );
    }
    return row;
}

// registry, not from whether `onFileSettingsChange` happens to be wired. It
// does not prove the autosave behaviour itself, which App.test.tsx owns.
it('disables Autosave when the registry defers it, even with the handler wired', () => {
    withRegistryAvailability({
        autosave: { kind: 'deferred', reason: 'test-deferred' },
    });
    render(<SettingsMenu {...props} fileSettings={{ autosave: true }} onFileSettingsChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('checkbox', { name: 'Autosave' })).toBeDisabled();
    expect(settingsRow('Autosave')).toHaveAttribute('data-availability', 'deferred');
});

it('keeps standard choices unavailable until settings are hydrated', () => {
    const onMarkdownSettingsChange = jest.fn();
    render(<SettingsMenu {...props} onMarkdownSettingsChange={onMarkdownSettingsChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(settingsRow('GFM')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(settingsRow('GFM'));
    expect(onMarkdownSettingsChange).not.toHaveBeenCalled();
});

it('reports unavailable state for rows with no writer', () => {
    render(<SettingsMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    for (const label of STATE_ROW_LABELS) {
        expect(settingsRow(label)).toHaveAttribute(
            'data-availability',
            label === 'Reading (Viewer)' || label === 'Editor' ? 'deferred' : 'available',
        );
        expect(settingsRow(label)).toHaveAttribute('aria-disabled', 'true');
    }
});

/* The open-mode rows still have no writer; Markdown standard now has one. */
it('activates a hydrated standard exactly once through its settings writer', () => {
    const onMarkdownSettingsChange = jest.fn();
    withRegistryAvailability({
        'default-open-mode': { kind: 'available' },
        'markdown-standard': { kind: 'available' },
    });
    render(
        <SettingsMenu
            {...props}
            markdownSettings={{
                bulletMarker: '+',
                emphasisMarker: '_',
                formatOnSave: true,
                headingStyle: 'setext',
                lintOnSave: false,
                standard: 'full',
            }}
            onMarkdownSettingsChange={onMarkdownSettingsChange}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(settingsRow('Reading (Viewer)')).toHaveAttribute('aria-disabled', 'true');
    expect(settingsRow('GFM')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByRole('menuitemradio', { name: 'GFM' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: 'Full (+ math, alerts, admonitions)' })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    fireEvent.click(settingsRow('GFM'));
    expect(onMarkdownSettingsChange).toHaveBeenCalledTimes(1);
    expect(onMarkdownSettingsChange).toHaveBeenCalledWith({ standard: 'gfm' });
});
