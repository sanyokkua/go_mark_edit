import { useEffect, useRef, useState } from 'react';

import { t } from '../../../i18n';
import {
    actionUnavailableLabelKey,
    getActionAvailability,
    type ActionEntry,
    type ActionId,
    type ProjectedActionState,
} from '../../../logic/actions/actionRegistry';
import type { ActionResult } from '../../../logic/actions/actionDispatcher';
import type { EditorActionSnapshot } from '../../../logic/actions/editorActionExecutor';
import type { OperationSlotState } from '../../../logic/operations/operationSlot';
import { currentPlatform, formatShortcut } from '../../../logic/actions/shortcutRegistry';
import MenuItem from '../../components/MenuItem';
import Popup, { PopupTrigger } from '../../components/Popup';

export interface FormatMenuProps {
    actions: readonly ActionEntry[];
    markdownSettingsLoaded: boolean;
    projectedState?: ProjectedActionState;
    slot: OperationSlotState;
    onExecute?: (id: ActionId, snapshot: EditorActionSnapshot | undefined) => Promise<ActionResult> | void;
    capture?: () => EditorActionSnapshot;
    onCancel?: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onTrigger?: () => void;
    showTrigger?: boolean;
    anchorElement?: HTMLElement | null;
}

export default function FormatMenu({
    actions,
    markdownSettingsLoaded,
    projectedState,
    slot,
    onExecute,
    capture,
    onCancel,
    open,
    onOpenChange,
    onTrigger,
    showTrigger = true,
    anchorElement,
}: FormatMenuProps): React.JSX.Element {
    const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
    const snapshot = useRef<EditorActionSnapshot | undefined>(undefined);
    useEffect(() => {
        if (open && snapshot.current === undefined) snapshot.current = capture?.();
        if (!open) snapshot.current = undefined;
    }, [capture, open]);
    const setOpen = (next: boolean): void => {
        if (next) snapshot.current = capture?.();
        onOpenChange(next);
    };
    return (
        <>
            {showTrigger ? (
                <PopupTrigger
                    ref={setTrigger}
                    expanded={open}
                    onClick={(): void => {
                        onTrigger?.();
                        setOpen(!open);
                    }}
                    onOpen={(): void => {
                        onTrigger?.();
                        setOpen(true);
                    }}
                >
                    {t('shell.format')}
                </PopupTrigger>
            ) : null}
            <Popup
                anchor={{ trigger: showTrigger ? trigger : (anchorElement ?? null) }}
                aria-label={t('shell.format')}
                data-viewport-popup="format-menu"
                initialFocus="first"
                open={open}
                returnFocusTo={showTrigger ? trigger : anchorElement}
                role="menu"
                size="menu"
                onOpenChange={setOpen}
            >
                {actions.map((item) => {
                    const availability = getActionAvailability(item.id, {
                        markdownSettingsLoaded,
                        projectedState,
                        slotBusy: slot.state === 'running',
                    });
                    const cancellable = slot.state === 'running' && slot.progress !== null && slot.kind === item.id;
                    const progress = slot.state === 'running' ? slot.progress : null;
                    const disabled = !cancellable && (availability.kind === 'unavailable' || onExecute === undefined);
                    const accelerator =
                        item.shortcut === undefined ? undefined : formatShortcut(item.shortcut, currentPlatform());
                    return (
                        <MenuItem
                            accelerator={cancellable ? undefined : accelerator}
                            aria-keyshortcuts={cancellable ? undefined : accelerator}
                            data-action-id={item.id}
                            disabled={disabled}
                            key={item.id}
                            label={cancellable ? t('tidy.cancel') : t(item.labelKey)}
                            title={
                                cancellable
                                    ? t('tidy.running')
                                    : availability.kind === 'unavailable'
                                      ? t(actionUnavailableLabelKey(availability.reason))
                                      : undefined
                            }
                            trailing={
                                cancellable && progress !== null ? `${progress.done}/${progress.total}` : undefined
                            }
                            onSelect={(): void => {
                                if (cancellable) onCancel?.();
                                else void onExecute?.(item.id, snapshot.current);
                                setOpen(false);
                            }}
                        />
                    );
                })}
            </Popup>
        </>
    );
}
