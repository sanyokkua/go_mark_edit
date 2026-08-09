import { actionRegistry, type ActionId } from './actionRegistry';

export type Platform = 'darwin' | 'win32' | 'linux';

export const shortcutRegistry: Readonly<Partial<Record<ActionId, string>>> =
  Object.freeze(
    Object.fromEntries(
      actionRegistry
        .filter((action) => action.shortcut !== undefined)
        .map((action) => [action.id, action.shortcut]),
    ),
  );

export const shortcutAliases: Readonly<
  Partial<Record<ActionId, readonly string[]>>
> = Object.freeze(
  Object.fromEntries(
    actionRegistry
      .filter((action) => action.shortcutAliases !== undefined)
      .map((action) => [action.id, action.shortcutAliases]),
  ),
);

const specialKeys: Record<string, string> = {
  ',': ',',
  '.': '.',
  '?': '?',
  '\\': '\\',
};

export function formatShortcut(binding: string, platform: Platform): string {
  if (binding === 'F11') return binding;
  return binding
    .split('+')
    .map((part) => {
      if (part === 'Mod') return platform === 'darwin' ? '⌘' : 'Ctrl';
      if (part === 'Alt') return platform === 'darwin' ? '⌥' : 'Alt';
      if (part === 'Shift') return platform === 'darwin' ? '⇧' : 'Shift';
      return specialKeys[part] ?? part.toUpperCase();
    })
    .join(platform === 'darwin' ? '' : '+');
}

interface KeyboardLikeEvent {
  code?: string;
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function physicalKeyToken(event: KeyboardLikeEvent): string | undefined {
  const code = event.code;
  if (code === undefined) return undefined;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const punctuation: Record<string, string> = {
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
  };
  return punctuation[code];
}

export function shortcutForKeyEvent(
  event: KeyboardLikeEvent,
  platform: Platform,
): string | undefined {
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const physicalKey = physicalKeyToken(event);
  const modifier = platform === 'darwin' ? event.metaKey : event.ctrlKey;
  if (
    key === 'F11' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    return 'F11';
  }
  if (!modifier && !event.altKey && !(platform === 'darwin' && event.ctrlKey)) {
    return undefined;
  }
  const modifierSets: string[][] = [];
  if (modifier) modifierSets.push(['Mod']);
  if (platform === 'darwin' && event.ctrlKey) modifierSets.push(['Ctrl']);
  if (!modifier && event.altKey) modifierSets.push(['Alt']);
  const candidates: string[] = [];
  for (const modifierParts of modifierSets) {
    const parts = [...modifierParts];
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey && modifier) parts.push('Alt');
    candidates.push(
      [...parts, physicalKey ?? key].join('+'),
      [...parts, key].join('+'),
    );
  }
  if (event.shiftKey && /^[^A-Z0-9]$/.test(key)) {
    candidates.push(
      ...modifierSets.map((modifierParts) =>
        [
          ...modifierParts,
          ...(event.altKey && modifier ? ['Alt'] : []),
          key,
        ].join('+'),
      ),
    );
  }
  const registered = actionRegistry.flatMap((action) => [
    action.shortcut,
    ...(action.shortcutAliases ?? []),
  ]);
  for (const candidate of candidates) {
    const direct = registered.find((binding) => binding === candidate);
    if (direct !== undefined) return direct;
    // Ctrl+PageUp/PageDown are physical Control bindings on every platform;
    // Mod is the platform-neutral spelling used by the registry primary map.
    const controlBinding = candidate.replace(/^Mod\+/, 'Ctrl+');
    const control = registered.find((binding) => binding === controlBinding);
    if (control !== undefined) return control;
  }
  return undefined;
}

export function currentPlatform(): Platform {
  if (
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform)
  ) {
    return 'darwin';
  }
  if (typeof navigator !== 'undefined' && /Win/.test(navigator.platform)) {
    return 'win32';
  }
  return 'linux';
}
