import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';

import SettingsDialog from './SettingsDialog';

function renderDialog(onOpenChange = jest.fn<void, [boolean]>()) {
  render(
    <SettingsDialog
      mode="auto"
      onModeChange={jest.fn()}
      onOpenChange={onOpenChange}
      onReset={jest.fn()}
      onThemeChange={jest.fn()}
      open
      theme="material"
    />,
  );
  return onOpenChange;
}

// Proves: FR-WS-015, FR-WS-017
it('contains only delivered Appearance controls and traps keyboard focus', () => {
  renderDialog();

  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(dialog).toHaveFocus();
  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
  expect(
    screen.getByRole('radiogroup', { name: 'Appearance' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/assistant|editor settings|files|future/i),
  ).toBeNull();

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([tabindex="-1"]), button[tabindex="0"]',
    ),
  );
  focusable.at(-1)?.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(focusable[0]).toHaveFocus();

  focusable[0].focus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(focusable.at(-1)).toHaveFocus();
});

// Proves: FR-WS-015, FR-WS-017
it('closes on Escape and restores focus to the opener', () => {
  const opener = document.createElement('button');
  opener.textContent = 'Open settings';
  document.body.append(opener);
  opener.focus();
  const onOpenChange = jest.fn<void, [boolean]>();
  const { rerender } = render(
    <SettingsDialog
      mode="auto"
      onModeChange={jest.fn()}
      onOpenChange={onOpenChange}
      onReset={jest.fn()}
      onThemeChange={jest.fn()}
      open
      theme="material"
    />,
  );

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  rerender(
    <SettingsDialog
      mode="auto"
      onModeChange={jest.fn()}
      onOpenChange={onOpenChange}
      onReset={jest.fn()}
      onThemeChange={jest.fn()}
      open={false}
      theme="material"
    />,
  );
  expect(opener).toHaveFocus();
});

it('T045 retains the binding settings selection on parity routes', () => {
  const originalUrl = window.location.href;
  window.history.replaceState(
    {},
    '',
    '/?parity-case=primary:settings-appearance:1280:glass-dark',
  );
  try {
    render(
      <SettingsDialog
        mode="dark"
        onModeChange={jest.fn()}
        onOpenChange={jest.fn()}
        onReset={jest.fn()}
        onThemeChange={jest.fn()}
        open
        theme="glass"
      />,
    );

    expect(screen.getByRole('button', { name: 'Material' })).toHaveAttribute(
      'class',
      expect.stringContaining('paritySelected'),
    );
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute(
      'class',
      expect.stringContaining('paritySelected'),
    );
    expect(screen.getByRole('button', { name: 'Glass' })).not.toHaveAttribute(
      'class',
      expect.stringContaining('paritySelected'),
    );
    expect(screen.getByRole('button', { name: 'Dark' })).not.toHaveAttribute(
      'class',
      expect.stringContaining('paritySelected'),
    );
    expect(
      readFileSync(
        resolve(process.cwd(), 'src/ui/widgets/SettingsDialog.module.css'),
        'utf8',
      ),
    ).toMatch(
      /:global\(:root\[data-theme='glass'\]\)\s+\.paritySelected\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*var\(--accent\),\s*var\(--accent2\)\);/s,
    );
    expect(
      readFileSync(
        resolve(process.cwd(), 'src/ui/widgets/SettingsDialog.module.css'),
        'utf8',
      ),
    ).toMatch(
      /:global\(:root\[data-theme='glass'\]\)\s+\.parityContent\s*\{[^}]*backdrop-filter:\s*var\(--blur\);/s,
    );
  } finally {
    window.history.replaceState({}, '', originalUrl);
  }
});

it('T045 keeps the narrow parity settings scrim viewport-owned', () => {
  const styles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/SettingsDialog.module.css'),
    'utf8',
  );

  expect(styles).toMatch(
    /@media \(max-width: 376px\) \{\s*\.parityOverlay\s*\{[^}]*position:\s*fixed;/s,
  );
});

it('T045 portals narrow parity settings scrims outside blurred app frames', () => {
  const originalUrl = window.location.href;
  const originalWidth = window.innerWidth;
  window.history.replaceState(
    {},
    '',
    '/?parity-case=primary:settings-appearance:375:glass-light',
  );
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  try {
    renderDialog();
    const surface = screen.getByRole('dialog', { name: 'Settings' });
    expect(surface.parentElement?.parentElement).toBe(document.body);
  } finally {
    window.history.replaceState({}, '', originalUrl);
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  }
});

it('T045 retains the reference picker flex geometry on parity routes', () => {
  expect(
    readFileSync(
      resolve(process.cwd(), 'src/ui/widgets/SettingsDialog.module.css'),
      'utf8',
    ),
  ).toMatch(
    /\.parityPick\s*\{[^}]*display:\s*flex;[^}]*gap:\s*0;[^}]*padding:\s*3px;/s,
  );
  expect(
    readFileSync(
      resolve(process.cwd(), 'src/ui/widgets/SettingsDialog.module.css'),
      'utf8',
    ),
  ).not.toMatch(
    /\.parityPick\s*\{[^}]*flex:\s*none;/s,
  );
});
