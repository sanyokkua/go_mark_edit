import { getAction, getActionAvailability, type ActionAvailabilityContext } from './actionRegistry';
import type { ActionScope } from './actionRegistry';
import { dispatchAction } from './actionDispatcher';

export type ShellActionId =
    'settings' | 'view' | 'about' | 'keyboard-shortcuts' | 'fullscreen' | 'toggle-sidebar' | 'distraction-free-reading';

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
    toggleReading?: () => void;
    documentOpen?: boolean;
    toggleFullscreen: () => Promise<boolean>;
}

export interface ShellAction {
    /** Extra facts the registry needs to judge this action, forwarded to its availability check and dispatch. */
    availabilityContext?: ActionAvailabilityContext;
    accessibilityKey: string;
    id: ShellActionId;
    invoke: () => Promise<unknown> | unknown;
    isAvailable: () => boolean;
    labelKey: string;
    scope: ShellActionScope;
    shortcut?: string;
}

export function createShellActionCatalogue(context: ShellActionContext): readonly ShellAction[] {
    const backgroundAvailable = (): boolean => !context.modalOpen;
    const registryAvailable = (id: ShellActionId, extra?: ActionAvailabilityContext): boolean =>
        getActionAvailability(id, { ...extra, modalOpen: context.modalOpen }).kind === 'available';
    const registryAction = (id: ShellActionId) => getAction(id);
    const catalogue: ShellAction[] = [
        {
            id: 'settings',
            labelKey: registryAction('settings').labelKey,
            accessibilityKey: registryAction('settings').accessibilityKey,
            scope: shellScope(registryAction('settings').scope),
            shortcut: registryAction('settings').shortcut,
            isAvailable: (): boolean => registryAvailable('settings') && backgroundAvailable(),
            invoke: context.openSettings,
        },
        {
            id: 'view',
            labelKey: registryAction('view').labelKey,
            accessibilityKey: registryAction('view').accessibilityKey,
            scope: shellScope(registryAction('view').scope),
            isAvailable: (): boolean => registryAvailable('view') && backgroundAvailable() && context.viewAvailable,
            invoke: context.openView,
        },
        {
            id: 'about',
            labelKey: registryAction('about').labelKey,
            accessibilityKey: registryAction('about').accessibilityKey,
            scope: shellScope(registryAction('about').scope),
            isAvailable: (): boolean => registryAvailable('about') && backgroundAvailable(),
            invoke: context.openAbout,
        },
        {
            id: 'fullscreen',
            labelKey: registryAction('fullscreen').labelKey,
            accessibilityKey: registryAction('fullscreen').accessibilityKey,
            scope: shellScope(registryAction('fullscreen').scope),
            shortcut: registryAction('fullscreen').shortcut,
            isAvailable: (): boolean => registryAvailable('fullscreen') && backgroundAvailable(),
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
            isAvailable: (): boolean => registryAvailable('keyboard-shortcuts') && backgroundAvailable(),
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
            isAvailable: (): boolean => registryAvailable('toggle-sidebar') && backgroundAvailable(),
            invoke: context.toggleSidebar,
        });
    }
    if (context.toggleReading !== undefined) {
        const reading = registryAction('distraction-free-reading');
        const availabilityContext: ActionAvailabilityContext = {
            documentId: context.documentOpen === true ? 'active' : undefined,
        };
        catalogue.push({
            id: 'distraction-free-reading',
            availabilityContext,
            labelKey: reading.labelKey,
            accessibilityKey: reading.accessibilityKey,
            scope: shellScope(reading.scope),
            shortcut: reading.shortcut,
            isAvailable: (): boolean =>
                registryAvailable('distraction-free-reading', availabilityContext) && backgroundAvailable(),
            invoke: context.toggleReading,
        });
    }
    return Object.freeze(catalogue);
}

export async function dispatchShellAction(action: ShellAction): Promise<boolean> {
    if (!action.isAvailable()) {
        return false;
    }
    const result = await dispatchAction(action.id, {
        ...action.availabilityContext,
        applicationFocused: action.scope === 'application',
        invoke: action.invoke,
        modalOpen: false,
        windowFocused: action.scope === 'window',
    });
    return result.status === 'mutated';
}
