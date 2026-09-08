import { getAction } from './actionRegistry';
import type { ActionScope } from './actionRegistry';
import { dispatchAction } from './actionDispatcher';

export type ShellActionId =
  | 'settings'
  | 'view'
  | 'about'
  | 'keyboard-shortcuts'
  | 'fullscreen'
  | 'toggle-sidebar';

export type ShellActionScope = 'application' | 'window';

function shellScope(scope: ActionScope): ShellActionScope {
  if (scope !== 'application' && scope !== 'window') {
    throw new Error(`Invalid shell action scope: ${scope}`);
  }
  return scope;
}

export interface ShellActionContext {
  modalOpen: boolean;
  viewAvailable: boolean;
  openSettings: () => void;
  openView: () => void;
  openAbout: () => void;
  openShortcuts?: () => void;
  toggleSidebar?: () => void;
  toggleFullscreen: () => Promise<boolean>;
}

export interface ShellAction {
  accessibilityKey: string;
  id: ShellActionId;
  invoke: () => Promise<unknown> | unknown;
  isAvailable: () => boolean;
  labelKey: string;
  scope: ShellActionScope;
  shortcut?: string;
}

export function createShellActionCatalogue(
  context: ShellActionContext,
): readonly ShellAction[] {
  const backgroundAvailable = (): boolean => !context.modalOpen;
  const registryAction = (id: ShellActionId) => getAction(id);
  const catalogue: ShellAction[] = [
    {
      id: 'settings',
      labelKey: registryAction('settings').labelKey,
      accessibilityKey: registryAction('settings').accessibilityKey,
      scope: shellScope(registryAction('settings').scope),
      shortcut: registryAction('settings').shortcut,
      isAvailable: backgroundAvailable,
      invoke: context.openSettings,
    },
    {
      id: 'view',
      labelKey: registryAction('view').labelKey,
      accessibilityKey: registryAction('view').accessibilityKey,
      scope: shellScope(registryAction('view').scope),
      isAvailable: (): boolean =>
        backgroundAvailable() && context.viewAvailable,
      invoke: context.openView,
    },
    {
      id: 'about',
      labelKey: registryAction('about').labelKey,
      accessibilityKey: registryAction('about').accessibilityKey,
      scope: shellScope(registryAction('about').scope),
      isAvailable: backgroundAvailable,
      invoke: context.openAbout,
    },
    {
      id: 'fullscreen',
      labelKey: registryAction('fullscreen').labelKey,
      accessibilityKey: registryAction('fullscreen').accessibilityKey,
      scope: shellScope(registryAction('fullscreen').scope),
      shortcut: registryAction('fullscreen').shortcut,
      isAvailable: backgroundAvailable,
      invoke: context.toggleFullscreen,
    },
  ];
  if (context.openShortcuts !== undefined) {
    const keyboardShortcuts = registryAction('keyboard-shortcuts');
    catalogue.push({
      id: 'keyboard-shortcuts',
      labelKey: keyboardShortcuts.labelKey,
      accessibilityKey: keyboardShortcuts.accessibilityKey,
      scope: shellScope(keyboardShortcuts.scope),
      shortcut: keyboardShortcuts.shortcut,
      isAvailable: backgroundAvailable,
      invoke: context.openShortcuts,
    });
  }
  if (context.toggleSidebar !== undefined) {
    const toggleSidebar = registryAction('toggle-sidebar');
    catalogue.push({
      id: 'toggle-sidebar',
      labelKey: toggleSidebar.labelKey,
      accessibilityKey: toggleSidebar.accessibilityKey,
      scope: shellScope(toggleSidebar.scope),
      shortcut: toggleSidebar.shortcut,
      isAvailable: backgroundAvailable,
      invoke: context.toggleSidebar,
    });
  }
  return Object.freeze(catalogue);
}

export async function dispatchShellAction(
  action: ShellAction,
): Promise<boolean> {
  if (!action.isAvailable()) {
    return false;
  }
  const result = await dispatchAction(action.id, {
    applicationFocused: action.scope === 'application',
    invoke: action.invoke,
    modalOpen: false,
    windowFocused: action.scope === 'window',
  });
  return result.status === 'mutated';
}
