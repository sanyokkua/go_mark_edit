export type ShellActionId = 'settings' | 'view' | 'about' | 'fullscreen';

export type ShellActionScope = 'application' | 'window';

export interface ShellActionContext {
  modalOpen: boolean;
  viewAvailable: boolean;
  openSettings: () => void;
  openView: () => void;
  openAbout: () => void;
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
  return Object.freeze([
    {
      id: 'settings',
      labelKey: 'settings.menu.trigger',
      accessibilityKey: 'settings.menu.trigger',
      scope: 'application',
      isAvailable: backgroundAvailable,
      invoke: context.openSettings,
    },
    {
      id: 'view',
      labelKey: 'view.menu.trigger',
      accessibilityKey: 'view.menu.trigger',
      scope: 'window',
      isAvailable: (): boolean =>
        backgroundAvailable() && context.viewAvailable,
      invoke: context.openView,
    },
    {
      id: 'about',
      labelKey: 'shell.about',
      accessibilityKey: 'shell.about',
      scope: 'application',
      isAvailable: backgroundAvailable,
      invoke: context.openAbout,
    },
    {
      id: 'fullscreen',
      labelKey: 'shell.fullscreen',
      accessibilityKey: 'shell.fullscreen',
      scope: 'window',
      shortcut: 'F11',
      isAvailable: backgroundAvailable,
      invoke: context.toggleFullscreen,
    },
  ] satisfies ShellAction[]);
}

export async function dispatchShellAction(
  action: ShellAction,
): Promise<boolean> {
  if (!action.isAvailable()) {
    return false;
  }
  await action.invoke();
  return true;
}
