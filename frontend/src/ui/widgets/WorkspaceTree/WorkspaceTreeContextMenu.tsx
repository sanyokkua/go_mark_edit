import { t } from '../../../i18n';
import { dispatchAction } from '../../../logic/actions/actionDispatcher';
import { actionsForSurface, getActionAvailability, type ActionId } from '../../../logic/actions/actionRegistry';
import type { WorkspaceNode } from '../../../logic/store/appModelTypes';
import MenuItem from '../../components/MenuItem';
import Popup, { type PopupAnchor } from '../../components/Popup';

export interface WorkspaceTreeContextMenuProps {
    node: WorkspaceNode | undefined;
    anchor: PopupAnchor;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAction: (actionId: ActionId, node: WorkspaceNode) => Promise<unknown>;
    onClose: () => void;
}

export default function WorkspaceTreeContextMenu({
    node,
    anchor,
    open,
    onOpenChange,
    onAction,
    onClose,
}: WorkspaceTreeContextMenuProps): React.JSX.Element | null {
    if (!open || node === undefined) return null;
    const context = {
        workspaceOpen: true,
        targetPath: node.path,
        targetNodeIsDir: node.isDir,
        targetNodeUnreadable: node.unreadable === true,
        windowFocused: true,
    };
    return (
        <Popup
            anchor={anchor}
            aria-label={t('workspace.tree.contextMenu')}
            initialFocus="first"
            open
            role="menu"
            size="menu"
            onOpenChange={(nextOpen): void => {
                onOpenChange(nextOpen);
                if (!nextOpen) onClose();
            }}
        >
            {actionsForSurface('tree-context')
                .filter((action) => getActionAvailability(action.id, context).kind === 'available')
                .map((action) => {
                    return (
                        <MenuItem
                            key={action.id}
                            data-action-id={action.id}
                            label={t(action.labelKey)}
                            onSelect={(): void => {
                                void dispatchAction(action.id, {
                                    ...context,
                                    invoke: (): Promise<unknown> => onAction(action.id, node),
                                }).then(onClose, onClose);
                            }}
                        />
                    );
                })}
        </Popup>
    );
}
