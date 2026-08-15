import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import catalogue from '../../i18n/locales/en.json';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import { getAction, type ActionId } from '../../logic/actions/actionRegistry';
import SettingsMenu from './SettingsMenu';

const catalogueValues = new Set(
  Object.values(catalogue as Record<string, string>),
);

const props = {
  mode: 'auto' as const,
  onModeChange: jest.fn(),
  onOpenAppearance: jest.fn(),
  onThemeChange: jest.fn(),
  theme: 'material' as const,
};

it('T070 positions Settings as a portal menu and restores its trigger focus after dismissal', async () => {
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
  render(
    <SettingsMenu
      {...props}
      fileSettings={{ autosave: true }}
      onFileSettingsChange={onFileSettingsChange}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  const autosave = screen.getByRole('checkbox', { name: 'Autosave' });
  expect(autosave).toBeChecked();
  fireEvent.click(autosave);
  expect(onFileSettingsChange).toHaveBeenCalledWith({ autosave: false });
  // `format-on-save` and `lint-on-save` are `laterDeferred` in the action
  // registry, which is the canonical authority for availability. The previous
  // assertion said the opposite of this test's own name, and of the registry.
  expect(
    screen.getByRole('checkbox', { name: 'Format on save' }),
  ).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Lint on save' })).toBeDisabled();
});

it('T069 draws every visible Settings popup string from the catalogue', () => {
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
   * T112 adds the second source: an accelerator is derived from the action
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

it('T069 keeps the binding popup labels, roles, and acknowledged state', () => {
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

  // Binding source: docs/delivery/spec/surface/mockup.html #m-settings.
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
    'Full (+ math, footnotes…)',
    'Autosave',
    'Format on save',
    'Lint on save',
    'All settings…',
    // T112: platform-derived, not a catalogue literal.
    formatShortcut(getAction('settings').shortcut as string, currentPlatform()),
  ]) {
    expect(menu).toHaveTextContent(label);
  }

  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Autosave' })).not.toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Format on save' }),
  ).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'Lint on save' }),
  ).not.toBeChecked();

  // Format on save and Lint on save are registry-deferred in this feature, so
  // the real control renders its acknowledged state but performs no write.
  fireEvent.click(screen.getByRole('checkbox', { name: 'Lint on save' }));
  expect(onMarkdownSettingsChange).not.toHaveBeenCalled();
});

it('T069 opens All settings from the keyboard and closes the popup', () => {
  const onOpenAppearance = jest.fn();
  render(<SettingsMenu {...props} onOpenAppearance={onOpenAppearance} />);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  const allSettings = screen.getByRole('menuitem', { name: /All settings/u });
  fireEvent.keyDown(allSettings, { key: 'Enter' });
  expect(onOpenAppearance).toHaveBeenCalled();
  expect(screen.queryByRole('menu', { name: 'Settings menu' })).toBeNull();
});

/*
 * T112: the accelerator beside `All settings…` was a hardcoded catalogue string
 * (`settings.menu.allSettings.accelerator`, literally "Ctrl ,"), so it was
 * platform-blind and told a macOS user to press Ctrl when the key that works is
 * ⌘. Every other menu accelerator is derived from the action registry through
 * `formatShortcut` — see ShellMenuRow's `shortcutForMenuItem` — which is why
 * the File menu renders ⌘N correctly on the same host.
 *
 * The assertion is written against the registry rather than a literal so it
 * cannot drift from the binding that is actually dispatched: `useShellShortcuts`
 * matches on `getAction('settings').shortcut`, and this is the text advertising
 * it.
 */
it('T112 advertises the Settings accelerator the platform actually dispatches', () => {
  render(<SettingsMenu {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  const binding = getAction('settings').shortcut;
  expect(binding).toBe('Mod+,');

  const allSettings = screen.getByRole('menuitem', { name: /All settings/u });
  expect(allSettings.textContent).toContain(
    formatShortcut(binding as string, currentPlatform()),
  );
});

it('T112 keeps no hardcoded accelerator string in the catalogue', () => {
  /*
   * A literal left in the catalogue is the defect itself: it renders whatever
   * platform it was written for. Deleting the key is part of the fix, so this
   * fails while the string survives anywhere under i18n/locales.
   */
  expect(Object.keys(catalogue as Record<string, string>)).not.toContain(
    'settings.menu.allSettings.accelerator',
  );
});
