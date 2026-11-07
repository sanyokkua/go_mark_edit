import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../../i18n';
import type { DocumentMetadata, RecentItem } from '../../../logic/store/appModelTypes';
import {
    actionsForSurface,
    groupedActionsForSurface,
    getAction,
    getActionAvailability,
    type ActionId,
    type ProjectedActionState,
} from '../../../logic/actions/actionRegistry';
import { currentPlatform, formatShortcut } from '../../../logic/actions/shortcutRegistry';
import { dispatchAction, type ActionResult } from '../../../logic/actions/actionDispatcher';
import { createShellActionCatalogue, dispatchShellAction, type ShellAction } from '../../../logic/actions/shellActions';
import {
    useShellShortcuts,
    type ShellShortcutAction,
    type ShortcutAction,
} from '../../../logic/actions/useShellShortcuts';
import { windowAdapter } from '../../../logic/adapter';
import AppBrand from '../../primitives/AppBrand';
import ToolButton from '../../primitives/ToolButton';
import ViewMenu, { type ViewMenuProps } from './ViewMenu';
import Icon from '../../primitives/Icon';
import MenuItem from '../../components/MenuItem';
import Popup, { PopupGroupLabel, PopupSeparator, PopupTrigger } from '../../components/Popup';
import DocumentIdentity from '../DocumentIdentity';
import { safeRecentLabel } from '../Launcher';
import { isMinimumWindow } from '../minimumWindow';
import SettingsMenu, { type SettingsMenuProps } from './SettingsMenu';
import MarkdownMenu, { type MarkdownMenuProps } from './MarkdownMenu';
import type { ApplicationMenuTarget } from '../applicationMenuRequest';
import Bar from '../../components/Bar';
import ModalShell from '../../components/ModalShell';
import Button from '../../primitives/Button';
import modalStyles from '../../components/ModalShell/ModalShell.module.css';
import styles from './Menubar.module.css';

/*
 * Keep the menu's accelerator and grouping presentation derived from the same
 * action registry used by dispatch and keyboard handling.
 */
const fileMenuSeparators = new Set<ActionId>(['open-recent', 'save', 'export-pdf', 'close-tab']);

const aboutMenuSeparators = new Set<ActionId>(['open-logs', 'about']);

function shortcutForMenuItem(shortcut: string | undefined): string | undefined {
    return shortcut === undefined ? undefined : formatShortcut(shortcut, currentPlatform());
}

function menuDecoration(id: ActionId): React.JSX.Element | null {
    return (
        <>
            {fileMenuSeparators.has(id) ? <PopupSeparator /> : null}
            {id === 'open-recent' ? <PopupGroupLabel>{t('file.menu.recent.label')}</PopupGroupLabel> : null}
        </>
    );
}

export interface MenubarProps {
    modalOpen: boolean;
    onAbout: () => void;
    onNewDocument?: () => unknown;
    onNewWindow?: () => unknown;
    onOpenDocument?: () => unknown;
    onOpenFolder?: () => unknown;
    onCloseFolder?: () => unknown;
    workspaceOpen?: boolean;
    onOpenRecentItem?: (item: RecentItem) => unknown;
    onRefreshRecentItems?: () => unknown;
    onClearRecentItems?: () => unknown;
    onReopenLastFile?: () => unknown;
    recentItems?: readonly RecentItem[];
    canReopenLastFile?: boolean;
    onSave?: () => unknown;
    onSaveAs?: () => unknown;
    onExportPdf?: () => unknown;
    onCloseDocument?: () => unknown;
    onQuit?: () => void;
    activeDocument?: DocumentMetadata;
    documentId?: string;
    sessionDocumentId?: string;
    writable?: boolean;
    onShortcuts?: () => void;
    settingsMenuProps: SettingsMenuProps;
    markdownMenuProps?: Pick<
        MarkdownMenuProps,
        'markdownSettingsLoaded' | 'editorShown' | 'projectedState' | 'slot' | 'onExecute' | 'capture' | 'onCancel'
    >;
    toggleFullscreen?: () => Promise<boolean>;
    viewMenuProps?: ViewMenuProps;
    requestedMenu?: ApplicationMenuTarget | null;
    onRequestedMenuHandled?: () => void;
    /*
     * File-surface dispatch results are handed to whoever owns the store
     * dispatch rather than reported here. Keeping the row free of `logic/store`
     * follows `EditorContextMenu`'s existing `onActionResult` prop, and means the
     * row's own tests need no Provider.
     */
    onActionResult?: (result: ActionResult) => void;
}

/*
 * Deliberately the static read, not `useMinimumWindow`: the menu row samples
 * the width to place its popups, and re-rendering the row on every resize
 * would move an open popup out from under the pointer.
 */
const isNarrowViewport = isMinimumWindow;

type ActiveMenu = 'settings' | 'view' | 'file' | 'markdown' | 'about' | null;

const Menubar: React.FC<MenubarProps> = ({
    modalOpen,
    onAbout,
    onNewDocument,
    onNewWindow,
    onOpenDocument,
    onOpenFolder,
    onCloseFolder,
    workspaceOpen = false,
    onOpenRecentItem,
    onRefreshRecentItems,
    onClearRecentItems,
    onReopenLastFile,
    recentItems = [],
    canReopenLastFile = false,
    onSave,
    onSaveAs,
    onExportPdf,
    onCloseDocument,
    onQuit,
    activeDocument,
    onShortcuts,
    documentId,
    sessionDocumentId,
    writable,
    settingsMenuProps,
    markdownMenuProps,
    toggleFullscreen = windowAdapter.toggleFullscreen,
    viewMenuProps,
    requestedMenu = null,
    onRequestedMenuHandled,
    onActionResult,
}: MenubarProps): React.JSX.Element => {
    const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
    const [confirmClearRecent, setConfirmClearRecent] = useState(false);
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [narrow, setNarrow] = useState(isNarrowViewport);
    const menuRowRef = useRef<HTMLElement | null>(null);
    const overflowTriggerRef = useRef<HTMLButtonElement | null>(null);
    const fileTriggerRef = useRef<HTMLButtonElement | null>(null);
    const aboutTriggerRef = useRef<HTMLButtonElement | null>(null);
    const [overflowTrigger, setOverflowTrigger] = useState<HTMLButtonElement | null>(null);
    const [fileTrigger, setFileTrigger] = useState<HTMLButtonElement | null>(null);
    const [aboutTrigger, setAboutTrigger] = useState<HTMLButtonElement | null>(null);
    const captureOverflowTrigger = useCallback((element: HTMLButtonElement | null): void => {
        overflowTriggerRef.current = element;
        setOverflowTrigger(element);
    }, []);
    const captureFileTrigger = useCallback((element: HTMLButtonElement | null): void => {
        fileTriggerRef.current = element;
        setFileTrigger(element);
    }, []);
    const captureAboutTrigger = useCallback((element: HTMLButtonElement | null): void => {
        aboutTriggerRef.current = element;
        setAboutTrigger(element);
    }, []);
    const { onOpenAppearance } = settingsMenuProps;
    const settingsOpen = activeMenu === 'settings';
    const markdownOpen = activeMenu === 'markdown';
    const viewOpen = activeMenu === 'view';
    const fileOpen = activeMenu === 'file';
    const aboutOpen = activeMenu === 'about';
    const setMenuOpen = (menu: Exclude<ActiveMenu, null>, open: boolean): void => {
        setActiveMenu((current): ActiveMenu => {
            if (open) return menu;
            return current === menu ? null : current;
        });
    };
    const setSettingsOpen = (open: boolean): void => setMenuOpen('settings', open);
    const setMarkdownOpen = (open: boolean): void => setMenuOpen('markdown', open);
    const setViewOpen = (open: boolean): void => setMenuOpen('view', open);
    const setFileOpen = (open: boolean): void => setMenuOpen('file', open);
    const setAboutOpen = (open: boolean): void => setMenuOpen('about', open);
    useEffect((): void => {
        if (fileOpen && !modalOpen) void onRefreshRecentItems?.();
    }, [fileOpen, modalOpen, onRefreshRecentItems]);

    /*
     * A menu request arriving as a prop is state derived from that prop, so it is
     * adjusted during render rather than in an effect: opening a menu from an
     * effect schedules a second render pass for every request.
     */
    const [handledMenuRequest, setHandledMenuRequest] = useState<ApplicationMenuTarget | null>(requestedMenu);
    if (requestedMenu !== handledMenuRequest) {
        setHandledMenuRequest(requestedMenu);
        if (requestedMenu !== null && !modalOpen) {
            setOverflowOpen(false);
            setActiveMenu(requestedMenu);
        }
    }

    useEffect((): void => {
        if (requestedMenu === null || modalOpen) return;
        onRequestedMenuHandled?.();
    }, [modalOpen, onRequestedMenuHandled, requestedMenu]);

    useEffect((): (() => void) => {
        const onResize = (): void => setNarrow(isNarrowViewport());
        window.addEventListener('resize', onResize);
        return (): void => window.removeEventListener('resize', onResize);
    }, []);

    /*
     * One table behind three surfaces: the accelerator text drawn beside a File
     * row, the row's click, and the keystroke. One table serves all three so the
     * read from the action registry while dispatch was read from a hand-written
     * catalogue of shell ids — two lists that drifted apart with every test still
     * green. Deriving all three from `fileInvokers` + `fileActionDisabled`
     * makes advertising a shortcut and dispatching it the same act.
     */
    const fileInvokers = useMemo(
        () =>
            new Map<ActionId, (() => unknown) | undefined>([
                ['new-file', onNewDocument],
                ['new-window', onNewWindow],
                ['open-file', onOpenDocument],
                ['open-folder', onOpenFolder],
                ['close-folder', onCloseFolder],
                ['save', onSave],
                ['save-as', onSaveAs],
                ['export-pdf', onExportPdf],
                ['close-tab', onCloseDocument],
                ['reopen', onReopenLastFile],
                ['exit', onQuit],
            ]),
        [
            onNewDocument,
            onNewWindow,
            onOpenDocument,
            onOpenFolder,
            onCloseFolder,
            onSave,
            onSaveAs,
            onExportPdf,
            onCloseDocument,
            onReopenLastFile,
            onQuit,
        ],
    );
    const projectedState = useMemo<ProjectedActionState>(
        () => ({
            activeDocumentId: documentId,
            canReopenLastFile,
            documents:
                documentId === undefined
                    ? {}
                    : {
                          [documentId]: {
                              capability: activeDocument?.capability,
                              detached: activeDocument?.detached,
                              path: activeDocument?.path,
                          },
                      },
            orderedDocumentIds: documentId === undefined ? [] : [documentId],
            recentItems,
        }),
        [activeDocument, canReopenLastFile, documentId, recentItems],
    );
    /*
     * A row whose handler is absent is greyed out and cannot dispatch.
     * do nothing. `App.tsx` passes `onCloseDocument` as undefined whenever there
     * is no active document — the launcher state, reached by closing the last tab
     * — and `Close Tab` then advertised itself as available while its click died
     * at the `invoke === undefined` return in `dispatchFileAction`. Observed on
     * the real binary 2026-08-15 with Save and Save As correctly greyed beside it.
     *
     * Checking the map is deliberate rather than an unconditional invoker check:
     * `fileInvokers.get` also returns undefined for `open-recent` and the
     * deferred ids, whose own rules are below and must keep governing them.
     *
     * `exit` used to spell this rule for itself (`onQuit === undefined`). It is
     * the same rule, so it is folded in rather than duplicated.
     */
    const fileActionDisabled = useCallback(
        (id: ActionId): boolean =>
            (id === 'close-folder' && !workspaceOpen) ||
            getActionAvailability(id, {
                documentId,
                modalOpen,
                projectedState,
                writable,
            }).kind !== 'available' ||
            (fileInvokers.has(id) && fileInvokers.get(id) === undefined),
        [documentId, fileInvokers, modalOpen, projectedState, writable, workspaceOpen],
    );

    const actions = useMemo(
        () =>
            createShellActionCatalogue({
                modalOpen,
                viewAvailable: viewMenuProps !== undefined,
                openSettings: (): void => {
                    setActiveMenu((current) => (current === 'view' || current === 'settings' ? null : current));
                    onOpenAppearance();
                },
                openView: (): void => {
                    setActiveMenu('view');
                },
                openAbout: (): void => {
                    setActiveMenu((current) => (current === 'view' || current === 'settings' ? null : current));
                    setOverflowOpen(false);
                    onAbout();
                },
                openShortcuts: onShortcuts,
                toggleSidebar:
                    viewMenuProps?.workspaceVisible === undefined ||
                    viewMenuProps.onWorkspaceVisibilityChange === undefined
                        ? undefined
                        : (): void => {
                              viewMenuProps.onWorkspaceVisibilityChange?.(!viewMenuProps.workspaceVisible);
                          },
                toggleReading: viewMenuProps?.onDistractionFreeReading,
                documentOpen: documentId !== undefined,
                toggleFullscreen,
            }),
        [documentId, modalOpen, onAbout, onOpenAppearance, onShortcuts, toggleFullscreen, viewMenuProps],
    );
    /*
     * Every File row that both declares a registry shortcut and has a handler
     * becomes a real binding. `exit` self-excludes because it deliberately
     * carries no registry shortcut — native quit owns it — and every deferred id
     * self-excludes through `fileActionDisabled`.
     *
     * `isAvailable` must answer honestly rather than return a constant:
     * `useShellShortcuts` calls preventDefault() only once it is true, so a
     * hardcoded `true` would swallow Mod+S on a read-only document instead of
     * letting the keystroke through. Gating on the same predicate that greys the
     * menu row keeps the two surfaces agreeing.
     */
    const fileShortcutActions = useMemo(
        (): readonly ShortcutAction[] =>
            actionsForSurface('file-menu').flatMap((item): readonly ShortcutAction[] => {
                const invoke = fileInvokers.get(item.id);
                const { shortcut } = item;
                if (invoke === undefined || shortcut === undefined) return [];
                return [
                    {
                        dispatchContext: {
                            applicationFocused: true,
                            documentId,
                            modalOpen,
                            projectedState,
                            sessionDocumentId,
                            writable,
                        },
                        id: item.id,
                        invoke,
                        isAvailable: (): boolean => !modalOpen && !fileActionDisabled(item.id),
                        onResult: (result: ActionResult): void => onActionResult?.(result),
                        shortcut,
                    },
                ];
            }),
        [
            documentId,
            fileActionDisabled,
            fileInvokers,
            modalOpen,
            onActionResult,
            projectedState,
            sessionDocumentId,
            writable,
        ],
    );
    const shortcutActions = useMemo(
        (): readonly ShellShortcutAction[] => [...actions, ...fileShortcutActions],
        [actions, fileShortcutActions],
    );
    useShellShortcuts(shortcutActions);

    const menuActions = actions.filter(
        (action): boolean =>
            action.id !== 'fullscreen' &&
            action.id !== 'toggle-sidebar' &&
            action.id !== 'distraction-free-reading' &&
            action.id !== 'keyboard-shortcuts' &&
            (action.id !== 'view' || viewMenuProps !== undefined),
    );
    const fileActions = actionsForSurface('file-menu');
    const markdownGroups = groupedActionsForSurface('markdown-menu');
    const fileActionLabel = (item: (typeof fileActions)[number]): string =>
        t(item.surfaceLabelKeys?.['file-menu'] ?? item.labelKey);
    /*
     * With no recent files the menu shows the defined empty message rather than
     * fabricated filenames.
     */
    const displayedRecentItems = recentItems.slice(0, 10);
    const noRecentItems = displayedRecentItems.length === 0;
    const recentEmptyMessage = (className: string): React.JSX.Element => (
        <div className={className} data-no-recent-items="true">
            {t('launcher.noRecent')}
        </div>
    );
    const aboutActions = actionsForSurface('about-menu');
    const sidebarAction = getAction('toggle-sidebar');
    const assistantAction = getAction('toggle-assistant');
    const action = (id: ShellAction['id']): ShellAction => {
        const found = actions.find((candidate) => candidate.id === id);
        if (found === undefined) {
            throw new Error(`Missing shell action: ${id}`);
        }
        return found;
    };
    const dispatch = (selected: ShellAction): void => {
        if (selected.id === 'about') {
            setAboutOpen(true);
            return;
        }
        void dispatchShellAction(selected);
    };
    const dispatchFileAction = (id: ActionId): void => {
        setFileOpen(false);
        setOverflowOpen(false);
        /*
         * `fileActionDisabled` now greys every row whose invoker is absent, so this
         * is a guard rather than a reachable branch. It still closes the popup
         * first: the narrow render site is a plain button whose click does not
         * dismiss the menu by itself, so returning above the close left the menu
         * open with nothing having happened.
         */
        const invoke = fileInvokers.get(id);
        if (invoke === undefined) return;

        void dispatchAction(id, {
            applicationFocused: true,
            documentId,
            invoke,
            projectedState,
            sessionDocumentId,
            writable,
        }).then((result): void => onActionResult?.(result));
    };
    const dispatchRecentItem = (item: RecentItem): void => {
        if (onOpenRecentItem === undefined) return;
        setFileOpen(false);
        setOverflowOpen(false);
        void dispatchAction('open-recent', {
            applicationFocused: true,
            invoke: (): unknown => onOpenRecentItem(item),
            modalOpen: false,
            projectedState,
        });
    };
    const requestViewOpen = (open: boolean): void => {
        setSettingsOpen(false);
        setViewOpen(open);
    };

    const selectAboutAction = (id: ActionId): void => {
        const selected = actions.find((candidate): boolean => candidate.id === id);
        if (selected === undefined) {
            throw new Error(`Missing shell action: ${id}`);
        }
        setAboutOpen(false);
        void dispatchShellAction(selected);
    };
    const renderFileItem = (item: (typeof fileActions)[number]): React.ReactNode => {
        if (item.id === 'open-recent') {
            if (noRecentItems) return recentEmptyMessage(styles.subItem);
            return displayedRecentItems.map((recent) => (
                <MenuItem
                    className={styles.subItem}
                    icon={<Icon aria-hidden="true" className={styles.subItemIcon} name={recent.kind} />}
                    key={'recent-' + recent.path}
                    label={<span className={styles.subItemLabel}>{safeRecentLabel(recent.path)}</span>}
                    title={recent.path}
                    onSelect={(): void => dispatchRecentItem(recent)}
                />
            ));
        }
        if (item.id === 'reopen') {
            return (
                <MenuItem
                    aria-label={t(item.labelKey)}
                    className={styles.subItem}
                    accelerator={shortcutForMenuItem(item.shortcut)}
                    disabled={fileActionDisabled(item.id)}
                    label={<span className={styles.subItemLabel}>{'↺ ' + fileActionLabel(item)}</span>}
                    onSelect={(): void => dispatchFileAction(item.id)}
                />
            );
        }
        return (
            <MenuItem
                aria-label={t(item.labelKey)}
                accelerator={shortcutForMenuItem(item.shortcut)}
                disabled={fileActionDisabled(item.id)}
                label={fileActionLabel(item)}
                onSelect={(): void => dispatchFileAction(item.id)}
            />
        );
    };
    const renderFileMenuItems = (): React.JSX.Element => (
        <>
            {fileActions
                .filter((item) => item.id !== 'clear-recent')
                .map((item) => (
                    <Fragment key={item.id}>
                        {menuDecoration(item.id)}
                        {renderFileItem(item)}
                        {item.id === 'open-recent' ? (
                            <MenuItem
                                className={styles.subItem}
                                disabled={noRecentItems || onClearRecentItems === undefined}
                                label={t('action.clear-recent.label')}
                                onSelect={(): void => {
                                    setFileOpen(false);
                                    setConfirmClearRecent(true);
                                }}
                            />
                        ) : null}
                    </Fragment>
                ))}
        </>
    );
    const renderAboutMenuItems = (): React.JSX.Element => (
        <>
            {aboutActions.map((item) => (
                <Fragment key={item.id}>
                    {aboutMenuSeparators.has(item.id) ? <PopupSeparator /> : null}
                    <MenuItem
                        accelerator={shortcutForMenuItem(item.shortcut)}
                        disabled={
                            getActionAvailability(item.id, {
                                modalOpen,
                                projectedState,
                            }).kind !== 'available'
                        }
                        label={t(item.labelKey)}
                        onSelect={(): void => selectAboutAction(item.id)}
                    />
                </Fragment>
            ))}
        </>
    );
    return (
        <nav ref={menuRowRef} aria-label={t('shell.menuLabel')} className={styles.row}>
            <Bar
                ariaLabel={t('shell.menuLabel')}
                className={styles.barFrame}
                leading={<AppBrand />}
                main={
                    <>
                        {narrow ? (
                            <>
                                <PopupTrigger
                                    ref={captureOverflowTrigger}
                                    aria-label={t('shell.overflow')}
                                    data-settings-overflow
                                    expanded={overflowOpen}
                                    onClick={(): void => setOverflowOpen(!overflowOpen)}
                                    onOpen={(): void => setOverflowOpen(true)}
                                >
                                    <Icon name="more" />
                                </PopupTrigger>
                                <Popup
                                    anchor={{ trigger: overflowTrigger }}
                                    aria-label={t('shell.menuLabel')}
                                    data-viewport-popup="shell-overflow"
                                    initialFocus="first"
                                    open={!modalOpen && overflowOpen}
                                    returnFocusTo={overflowTrigger}
                                    role="menu"
                                    size="menu"
                                    onOpenChange={setOverflowOpen}
                                >
                                    <MenuItem
                                        label={t('shell.file')}
                                        onSelect={(): void => {
                                            setOverflowOpen(false);
                                            setFileOpen(true);
                                        }}
                                    />
                                    <MenuItem
                                        label={t('shell.markdown')}
                                        onSelect={(): void => {
                                            setOverflowOpen(false);
                                            setMarkdownOpen(true);
                                        }}
                                    />
                                    {menuActions.map((item) => (
                                        <MenuItem
                                            accelerator={shortcutForMenuItem(item.shortcut)}
                                            disabled={!item.isAvailable()}
                                            key={item.id}
                                            label={item.id === 'about' ? t('shell.about') : t(item.labelKey)}
                                            onSelect={(): void => {
                                                setOverflowOpen(false);
                                                if (item.id === 'view') requestViewOpen(true);
                                                /* The overflow row opens the Settings popup; only Mod+, opens the dialog. */
                                                dispatch(
                                                    item.id === 'settings'
                                                        ? { ...item, invoke: (): void => setSettingsOpen(true) }
                                                        : item,
                                                );
                                            }}
                                        />
                                    ))}
                                </Popup>

                                <Popup
                                    anchor={{ trigger: overflowTrigger }}
                                    aria-label={t('shell.file')}
                                    className={styles.narrowOverflow}
                                    data-viewport-popup="file-menu"
                                    initialFocus="first"
                                    open={!modalOpen && fileOpen}
                                    returnFocusTo={overflowTrigger}
                                    role="menu"
                                    size="menu"
                                    onOpenChange={setFileOpen}
                                >
                                    {renderFileMenuItems()}
                                </Popup>

                                <Popup
                                    anchor={{ trigger: overflowTrigger }}
                                    aria-label={t(action('about').labelKey)}
                                    className={styles.narrowOverflow}
                                    data-viewport-popup="about-menu"
                                    initialFocus="first"
                                    open={!modalOpen && aboutOpen}
                                    returnFocusTo={overflowTrigger}
                                    role="menu"
                                    size="menu"
                                    onOpenChange={setAboutOpen}
                                >
                                    {renderAboutMenuItems()}
                                </Popup>

                                <SettingsMenu
                                    {...settingsMenuProps}
                                    open={!modalOpen && settingsOpen}
                                    onOpenChange={setSettingsOpen}
                                    onOpenAppearance={(): void => {
                                        setSettingsOpen(false);
                                        settingsMenuProps.onOpenAppearance(overflowTrigger);
                                    }}
                                    anchorElement={overflowTrigger}
                                    showTrigger={false}
                                />
                                <MarkdownMenu
                                    groups={markdownGroups}
                                    markdownSettingsLoaded={markdownMenuProps?.markdownSettingsLoaded ?? false}
                                    editorShown={markdownMenuProps?.editorShown}
                                    projectedState={markdownMenuProps?.projectedState ?? projectedState}
                                    slot={markdownMenuProps?.slot ?? { state: 'idle' }}
                                    capture={markdownMenuProps?.capture}
                                    onExecute={markdownMenuProps?.onExecute}
                                    onCancel={markdownMenuProps?.onCancel}
                                    open={!modalOpen && markdownOpen}
                                    onOpenChange={setMarkdownOpen}
                                    showTrigger={false}
                                    anchorElement={overflowTrigger}
                                />
                                {viewMenuProps === undefined ? null : (
                                    <ViewMenu
                                        {...viewMenuProps}
                                        open={!modalOpen && viewOpen}
                                        onOpenChange={(nextOpen): void => {
                                            if (nextOpen) requestViewOpen(true);
                                            else setViewOpen(false);
                                        }}
                                        onArrangementChange={(arrangement): void => {
                                            viewMenuProps.onArrangementChange?.(arrangement);
                                            requestViewOpen(false);
                                        }}
                                        onWorkspaceVisibilityChange={(visible): void => {
                                            viewMenuProps.onWorkspaceVisibilityChange?.(visible);
                                            requestViewOpen(false);
                                        }}
                                        anchorRef={overflowTriggerRef}
                                        anchorElement={overflowTrigger}
                                        showTrigger={false}
                                    />
                                )}
                            </>
                        ) : (
                            <div className={styles.menu} data-shell-menu>
                                <PopupTrigger
                                    ref={captureFileTrigger}
                                    expanded={fileOpen}
                                    onClick={(): void => {
                                        setSettingsOpen(false);
                                        setViewOpen(false);
                                        setAboutOpen(false);
                                        setFileOpen(!fileOpen);
                                    }}
                                    onOpen={(): void => {
                                        setSettingsOpen(false);
                                        setViewOpen(false);
                                        setAboutOpen(false);
                                        setFileOpen(true);
                                    }}
                                >
                                    {t('shell.file')}
                                </PopupTrigger>
                                <Popup
                                    anchor={{ trigger: fileTrigger }}
                                    aria-label={t('shell.file')}
                                    data-viewport-popup="file-menu"
                                    initialFocus="first"
                                    open={!modalOpen && fileOpen}
                                    returnFocusTo={fileTrigger}
                                    role="menu"
                                    size="menu"
                                    onOpenChange={setFileOpen}
                                >
                                    {renderFileMenuItems()}
                                </Popup>

                                <MarkdownMenu
                                    groups={markdownGroups}
                                    markdownSettingsLoaded={markdownMenuProps?.markdownSettingsLoaded ?? false}
                                    editorShown={markdownMenuProps?.editorShown}
                                    projectedState={markdownMenuProps?.projectedState ?? projectedState}
                                    slot={markdownMenuProps?.slot ?? { state: 'idle' }}
                                    capture={markdownMenuProps?.capture}
                                    onExecute={markdownMenuProps?.onExecute}
                                    onCancel={markdownMenuProps?.onCancel}
                                    open={!modalOpen && markdownOpen}
                                    onOpenChange={setMarkdownOpen}
                                    onTrigger={(): void => {
                                        setFileOpen(false);
                                        setSettingsOpen(false);
                                        setViewOpen(false);
                                        setAboutOpen(false);
                                    }}
                                />
                                <SettingsMenu
                                    {...settingsMenuProps}
                                    open={!modalOpen && settingsOpen}
                                    onOpenChange={setSettingsOpen}
                                    onTrigger={(): void => {
                                        setFileOpen(false);
                                        setViewOpen(false);
                                        setAboutOpen(false);
                                        setSettingsOpen(!settingsOpen);
                                    }}
                                    onOpenAppearance={(opener): void => {
                                        setSettingsOpen(false);
                                        settingsMenuProps.onOpenAppearance(opener);
                                    }}
                                    triggerLabel={t(action('settings').labelKey)}
                                />
                                {viewMenuProps === undefined ? null : (
                                    <ViewMenu
                                        {...viewMenuProps}
                                        modalOpen={modalOpen}
                                        open={!modalOpen && viewOpen}
                                        onOpenChange={requestViewOpen}
                                        onTrigger={(): void => {
                                            setFileOpen(false);
                                            setSettingsOpen(false);
                                            setAboutOpen(false);
                                            requestViewOpen(!viewOpen);
                                        }}
                                        triggerLabel={t(action('view').labelKey)}
                                    />
                                )}
                                <PopupTrigger
                                    ref={captureAboutTrigger}
                                    expanded={aboutOpen}
                                    onClick={(): void => {
                                        setSettingsOpen(false);
                                        setViewOpen(false);
                                        setFileOpen(false);
                                        setAboutOpen(!aboutOpen);
                                    }}
                                    onOpen={(): void => {
                                        setSettingsOpen(false);
                                        setViewOpen(false);
                                        setFileOpen(false);
                                        setAboutOpen(true);
                                    }}
                                >
                                    {t('shell.about')}
                                </PopupTrigger>
                                <Popup
                                    anchor={{ trigger: aboutTrigger }}
                                    aria-label={t(action('about').labelKey)}
                                    data-viewport-popup="about-menu"
                                    initialFocus="first"
                                    open={!modalOpen && aboutOpen}
                                    returnFocusTo={aboutTrigger}
                                    role="menu"
                                    size="menu"
                                    onOpenChange={setAboutOpen}
                                >
                                    {renderAboutMenuItems()}
                                </Popup>
                            </div>
                        )}
                    </>
                }
                overflow="scroll"
                role="menubar"
                trailing={
                    <>
                        <div aria-hidden="true" className={styles.spacer} />

                        {activeDocument !== undefined ? <DocumentIdentity document={activeDocument} /> : null}

                        {!narrow && viewMenuProps?.onWorkspaceVisibilityChange !== undefined ? (
                            <div className={styles.menuRowActions} data-menu-row-actions>
                                <ToolButton
                                    className={styles.rowAction}
                                    data-action-id={sidebarAction.id}
                                    icon="sidebar"
                                    label={t(sidebarAction.accessibilityKey)}
                                    pressed={viewMenuProps.workspaceVisible ?? false}
                                    variant="icon"
                                    onActivate={(): void => dispatch(action('toggle-sidebar'))}
                                />
                                <ToolButton
                                    className={styles.rowAction}
                                    data-action-id={assistantAction.id}
                                    data-availability={
                                        getActionAvailability('toggle-assistant', {
                                            modalOpen,
                                            projectedState,
                                        }).kind
                                    }
                                    disabled={
                                        getActionAvailability('toggle-assistant', {
                                            modalOpen,
                                            projectedState,
                                        }).kind !== 'available'
                                    }
                                    icon="assistant"
                                    label={t(assistantAction.accessibilityKey)}
                                    title={t('action.unavailable')}
                                    variant="icon"
                                />
                            </div>
                        ) : null}
                    </>
                }
            />
            <ModalShell
                dismiss="escape"
                onRequestClose={(): void => setConfirmClearRecent(false)}
                open={confirmClearRecent}
                title={t('recent.clear.title')}
            >
                <div className={modalStyles.promptBody}>
                    <p>{t('recent.clear.message')}</p>
                    <div className={modalStyles.actions}>
                        <Button variant="secondary" onClick={(): void => setConfirmClearRecent(false)}>
                            {t('recent.clear.cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={(): void => {
                                setConfirmClearRecent(false);
                                void onClearRecentItems?.();
                            }}
                        >
                            {t('action.clear-recent.label')}
                        </Button>
                    </div>
                </div>
            </ModalShell>
        </nav>
    );
};

export default Menubar;
