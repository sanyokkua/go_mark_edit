import {
    useContext,
    useEffect,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
} from 'react';

import { t } from '../../i18n';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import { getAction, type ActionId } from '../../logic/actions/actionRegistry';
import MenuItem from '../components/MenuItem';
import Popup from '../components/Popup';
import { EditorClipboardPortContext } from './useEditorActionExecutor';

const menuActionIds: readonly ActionId[] = ['preview-copy', 'preview-select-all'];

const DOCUMENT_SELECTOR = 'article.gme-preview';

/** The text selected inside the rendered document, or an empty string when the selection is elsewhere. */
function selectedDocumentText(host: HTMLElement): string {
    const article = host.querySelector(DOCUMENT_SELECTOR);
    const selection = window.getSelection();
    if (article === null || selection === null || selection.isCollapsed || selection.rangeCount === 0) return '';
    return article.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.toString() : '';
}

interface OpenMenu {
    readonly host: HTMLElement;
    readonly point: { x: number; y: number };
    readonly selectedText: string;
}

export interface PreviewContextMenuHostProps {
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export interface PreviewContextMenuProps {
    /** Receives the handlers to spread onto the element that contains the rendered document. */
    children: (hostProps: PreviewContextMenuHostProps) => ReactNode;
}

/**
 * Right-click and keyboard context menu for the rendered preview. Copy writes the selected text through the
 * native clipboard port; Select all selects only the rendered document. Native selection and Ctrl/Cmd+C are
 * untouched.
 */
const PreviewContextMenu: React.FC<PreviewContextMenuProps> = ({
    children,
}: PreviewContextMenuProps): React.JSX.Element => {
    const clipboard = useContext(EditorClipboardPortContext);
    const [menu, setMenu] = useState<OpenMenu | null>(null);
    const [opener, setOpener] = useState<HTMLElement | null>(null);
    const [selectAllHost, setSelectAllHost] = useState<HTMLElement | null>(null);

    // Returning focus to the opener collapses the selection, so Select all runs once the menu has closed.
    useEffect((): void => {
        if (menu !== null || selectAllHost === null) return;
        const article = selectAllHost.querySelector(DOCUMENT_SELECTOR);
        if (article !== null) window.getSelection()?.selectAllChildren(article);
    }, [menu, selectAllHost]);

    const open = (host: HTMLElement, point: { x: number; y: number }): void => {
        const active = document.activeElement;
        setSelectAllHost(null);
        setOpener(active instanceof HTMLElement && host.contains(active) ? active : host);
        setMenu({
            host,
            point,
            selectedText: selectedDocumentText(host),
        });
    };

    const openFromKeyboard = (event: ReactKeyboardEvent<HTMLElement>): void => {
        if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
        event.preventDefault();
        const target = event.target instanceof HTMLElement ? event.target : event.currentTarget;
        const bounds = target.getBoundingClientRect();
        open(event.currentTarget, {
            x: bounds.left + Math.min(bounds.width / 2, 16),
            y: bounds.top + Math.min(bounds.height / 2, 16),
        });
    };

    const openFromPointer = (event: ReactMouseEvent<HTMLElement>): void => {
        event.preventDefault();
        open(event.currentTarget, {
            x: event.clientX,
            y: event.clientY,
        });
    };

    const activate = (actionId: ActionId): void => {
        if (menu === null) return;
        void dispatchAction(actionId, {
            windowFocused: true,
            invoke: (): Promise<boolean> | void =>
                actionId === 'preview-copy' ? clipboard.writeText(menu.selectedText) : setSelectAllHost(menu.host),
        });
        setMenu(null);
    };

    return (
        <>
            {children({ onContextMenu: openFromPointer, onKeyDown: openFromKeyboard })}
            <Popup
                anchor={{ point: menu?.point ?? { x: 0, y: 0 } }}
                aria-label={t('preview.contextMenu')}
                data-viewport-popup="context-menu"
                initialFocus="first"
                open={menu !== null}
                returnFocusTo={opener}
                role="menu"
                size="menu"
                onContextMenu={(event): void => event.preventDefault()}
                onOpenChange={(nextOpen): void => {
                    if (!nextOpen) setMenu(null);
                }}
            >
                {menuActionIds.map((id: ActionId) => {
                    const item = getAction(id);
                    return (
                        <MenuItem
                            key={id}
                            data-action-id={id}
                            disabled={id === 'preview-copy' && menu?.selectedText === ''}
                            label={t(item.labelKey)}
                            onSelect={(): void => activate(id)}
                        />
                    );
                })}
            </Popup>
        </>
    );
};

export default PreviewContextMenu;
