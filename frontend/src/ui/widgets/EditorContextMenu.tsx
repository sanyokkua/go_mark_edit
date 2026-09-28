import {
    Fragment,
    useContext,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PropsWithChildren,
} from 'react';

import { t } from '../../i18n';
import {
    actionsForSurface,
    getActionAvailability,
    type ActionId,
    type ActionEntry,
} from '../../logic/actions/actionRegistry';
import type { ActionResult } from '../../logic/actions/actionDispatcher';
import type { EditorActionSnapshot } from '../../logic/actions/editorActionExecutor';
import { useEditingProjection } from '../../logic/hooks/useEditingProjection';
import { currentPlatform, formatShortcut } from '../../logic/actions/shortcutRegistry';
import MenuItem from '../components/MenuItem';
import Popup, { PopupSeparator } from '../components/Popup';
import { EditorSessionContext } from './editorSession';
import { useEditorActionExecutor } from './useEditorActionExecutor';
import styles from './EditorContextMenu.module.css';

export interface EditorContextMenuProps extends PropsWithChildren {
    onAction?: (actionId: ActionId) => void;
    onActionResult?: (result: ActionResult) => void;
}

const contextActions = actionsForSurface('context');

function editorFocusTarget(target: EventTarget | null): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('[data-editor-surface]') !== null) return active;
    const element = target instanceof HTMLElement ? target : null;
    const surface = element?.closest<HTMLElement>('[data-editor-surface]');
    return surface?.querySelector<HTMLElement>('textarea, [contenteditable="true"]') ?? surface ?? element;
}

const EditorContextMenu: React.FC<EditorContextMenuProps> = ({
    children,
    onAction,
    onActionResult,
}: EditorContextMenuProps): React.JSX.Element => {
    const activeBuffer = useContext(EditorSessionContext);
    const editingProjection = useEditingProjection(activeBuffer?.documentId);
    const { capture, execute } = useEditorActionExecutor();
    const itemUnavailable = (item: {
        id: Parameters<typeof getActionAvailability>[0];
        availability: { kind: string };
    }): boolean =>
        item.availability.kind === 'deferred' ||
        (editingProjection !== undefined &&
            getActionAvailability(item.id, { projectedState: editingProjection }).kind === 'unavailable');
    const openerRef = useRef<HTMLElement | null>(null);
    const actionSnapshotRef = useRef<EditorActionSnapshot | null>(null);
    const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

    const openFromTarget = (target: EventTarget | null, nextPoint: { x: number; y: number }): void => {
        actionSnapshotRef.current = capture();
        openerRef.current = editorFocusTarget(target);
        setPoint(nextPoint);
    };

    const openFromKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) {
            return;
        }
        event.preventDefault();
        const target = event.target instanceof HTMLElement ? event.target : event.currentTarget;
        const bounds = target.getBoundingClientRect();
        openFromTarget(target, {
            x: bounds.left + Math.min(bounds.width / 2, 16),
            y: bounds.top + Math.min(bounds.height / 2, 16),
        });
    };

    const activate = (actionId: ActionId): void => {
        onAction?.(actionId);
        void execute(actionId, actionSnapshotRef.current ?? capture()).then((result): void => {
            onActionResult?.(result);
        });
        setPoint(null);
    };

    return (
        <div
            className={styles.host}
            onContextMenu={(event): void => {
                event.preventDefault();
                openFromTarget(event.target, { x: event.clientX, y: event.clientY });
            }}
            onKeyDown={openFromKeyboard}
        >
            {children}
            <Popup
                anchor={{ point: point ?? { x: 0, y: 0 } }}
                aria-label={t('editor.contextMenu')}
                data-viewport-popup="context-menu"
                initialFocus="first"
                open={point !== null}
                returnFocusTo={openerRef}
                role="menu"
                size="menu"
                onContextMenu={(event): void => event.preventDefault()}
                onOpenChange={(open): void => {
                    if (!open) setPoint(null);
                }}
            >
                {contextActions.map((item: ActionEntry) => {
                    const accelerator =
                        item.shortcut === undefined ? undefined : formatShortcut(item.shortcut, currentPlatform());
                    const menuItem = (
                        <MenuItem
                            accelerator={accelerator}
                            aria-keyshortcuts={accelerator}
                            data-action-id={item.id}
                            disabled={itemUnavailable(item)}
                            label={t(item.surfaceLabelKeys?.context ?? item.labelKey)}
                            onSelect={(): void => activate(item.id)}
                        />
                    );
                    return item.separatorBefore?.includes('context') === true ? (
                        <Fragment key={'separator-before-' + item.id}>
                            <PopupSeparator />
                            {menuItem}
                        </Fragment>
                    ) : (
                        <Fragment key={item.id}>{menuItem}</Fragment>
                    );
                })}
            </Popup>
        </div>
    );
};

export default EditorContextMenu;
