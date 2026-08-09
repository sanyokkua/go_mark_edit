import {
  formatShortcut,
  shortcutAliases,
  shortcutRegistry,
  shortcutForKeyEvent,
} from './shortcutRegistry';

it('T002 exposes the frozen Editor-stage bindings', () => {
  expect(shortcutRegistry.bold).toBe('Mod+B');
  expect(shortcutRegistry.italic).toBe('Mod+I');
  expect(shortcutRegistry['heading-1']).toBe('Mod+1');
  expect(shortcutRegistry['numbered-list']).toBe('Mod+Shift+7');
  expect(shortcutRegistry.table).toBe('Mod+Shift+T');
  expect(shortcutRegistry.format).toBe('Alt+Shift+F');
  expect(shortcutRegistry.fullscreen).toBe('F11');
});

it('T018 binds next and previous navigation to the exact alternate keys', () => {
  expect(shortcutRegistry['next-tab']).toBe('Mod+Tab');
  expect(shortcutAliases['next-tab']).toEqual(['Ctrl+PageDown']);
  expect(shortcutRegistry['previous-tab']).toBe('Mod+Shift+Tab');
  expect(shortcutAliases['previous-tab']).toEqual(['Ctrl+PageUp']);
  expect(
    shortcutForKeyEvent(
      {
        key: 'PageDown',
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      },
      'darwin',
    ),
  ).toBe('Ctrl+PageDown');
});

it('shortcut registry has no duplicate binding', () => {
  const bindings = [
    ...Object.values(shortcutRegistry),
    ...Object.values(shortcutAliases).flat(),
  ];
  expect(new Set(bindings).size).toBe(bindings.length);
});

it('Move tab left and right bind to Mod+Shift+PageUp and Mod+Shift+PageDown', () => {
  expect(shortcutRegistry['move-tab-left']).toBe('Mod+Shift+PageUp');
  expect(shortcutRegistry['move-tab-right']).toBe('Mod+Shift+PageDown');
});

it('Table retains Mod+Shift+T', () => {
  expect(shortcutRegistry.table).toBe('Mod+Shift+T');
});

it('Reopen last file binds Mod+Shift+Alt+T', () => {
  expect(shortcutRegistry.reopen).toBe('Mod+Shift+Alt+T');
});

it('Refresh preview exposes no shortcut', () => {
  expect(shortcutRegistry['refresh-preview']).toBeUndefined();
});

it('no jump-to-tab-by-number binding exists', () => {
  expect(
    Object.keys(shortcutRegistry).some((id) => /^tab-[0-9]+$/.test(id)),
  ).toBe(false);
});

it('T030 matches active-tab movement and reopen keyboard events', () => {
  expect(
    shortcutForKeyEvent(
      {
        key: 'PageUp',
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
      },
      'linux',
    ),
  ).toBe('Mod+Shift+PageUp');
  expect(
    shortcutForKeyEvent(
      {
        key: 't',
        metaKey: false,
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
      },
      'linux',
    ),
  ).toBe('Mod+Shift+Alt+T');
});

it('T002 resolves platform labels without changing the binding', () => {
  expect(formatShortcut('Mod+Shift+F', 'darwin')).toBe('⌘⇧F');
  expect(formatShortcut('Alt+Shift+F', 'win32')).toBe('Alt+Shift+F');
  expect(formatShortcut('Mod+Shift+F', 'linux')).toBe('Ctrl+Shift+F');
});

it('T002 matches a keyboard event to the platform-neutral binding', () => {
  expect(
    shortcutForKeyEvent(
      {
        key: 'b',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      },
      'darwin',
    ),
  ).toBe('Mod+B');
  expect(
    shortcutForKeyEvent(
      {
        key: '7',
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
      },
      'linux',
    ),
  ).toBe('Mod+Shift+7');
});

it('T056 normalizes shifted physical keys and punctuation by code', () => {
  expect(
    shortcutForKeyEvent(
      {
        code: 'Digit8',
        key: '*',
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
      },
      'linux',
    ),
  ).toBe('Mod+Shift+8');
  expect(
    shortcutForKeyEvent(
      {
        code: 'Slash',
        key: '?',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
      },
      'darwin',
    ),
  ).toBe('Mod+?');
});
