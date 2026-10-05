import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../../i18n';
import type { DocumentMetadata, RecentItem } from '../../../logic/store/appModelTypes';
import {
    actionsForSurface,
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
import FormatMenu, { type FormatMenuProps } from './FormatMenu';
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

/*
 * Exactly the ids `fileActionInvoker` can resolve to a handler. Membership here
 * means "this row is only real when its prop was supplied", which is what lets
 * `fileActionDisabled` grey the row instead of letting it render enabled and
 * inert. `open-recent` is absent on purpose: it has no invoker and its own
 * recent-count rule governs it.
 */
const FILE_ACTIONS_WITH_INVOKERS: ReadonlySet<ActionId> = new Set<ActionId>([
    'new-file',
    'new-window',
    'open-file',
    'open-folder',
    'close-folder',
    'save',
    'save-as',
    'close-tab',
    'reopen',
    'exit',
]);

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
    onNewDocument?: () => Promise<unknown> | unknown;
    onNewWindow?: () => Promise<unknown> | unknown;
    onOpenDocument?: () => Promise<unknown> | unknown;
    onOpenFolder?: () => Promise<unknown> | unknown;
    onCloseFolder?: () => Promise<unknown> | unknown;
    workspaceOpen?: boolean;
    onOpenRecentItem?: (item: RecentItem) => Promise<unknown> | unknown;
    onRefreshRecentItems?: () => Promise<unknown> | unknown;
    onClearRecentItems?: () => Promise<unknown> | unknown;
    onReopenLastFile?: () => Promise<unknown> | unknown;
    recentItems?: readonly RecentItem[];
    canReopenLastFile?: boolean;
    onSave?: () => Promise<unknown> | unknown;
    onSaveAs?: () => Promise<unknown> | unknown;
    onCloseDocument?: () => Promise<unknown> | unknown;
    onQuit?: () => void;
    activeDocument?: DocumentMetadata;
    documentId?: string;
    sessionDocumentId?: string;
    writable?: boolean;
    onShortcuts?: () => void;
    settingsMenuProps: SettingsMenuProps;
    formatMenuProps?: Pick<
        FormatMenuProps,
        'markdownSettingsLoaded' | 'projectedState' | 'slot' | 'onExecute' | 'capture' | 'onCancel'
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

type ActiveMenu = 'settings' | 'view' | 'file' | 'format' | 'about' | null;

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
    onCloseDocument,
    onQuit,
    activeDocument,
    onShortcuts,
    documentId,
    sessionDocumentId,
    writable,
    settingsMenuProps,
    formatMenuProps,
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
    const settingsOpen = activeMenu === 'settings';
    const formatOpen = activeMenu === 'format';
    const viewOpen = activeMenu === 'view';
    const fileOpen = activeMenu === 'file';
    const aboutOpen = activeMenu === 'about';
    const setSettingsOpen = (open: boolean): void => {
        setActiveMenu((current): ActiveMenu => (open ? 'settings' : current === 'settings' ? null : current));
    };
    const setFormatOpen = (open: boolean): void => {
        setActiveMenu((current): ActiveMenu => (open ? 'format' : current === 'format' ? null : current));
    };
    const setViewOpen = (open: boolean): void => {
        setActiveMenu((current): ActiveMenu => (open ? 'view' : current === 'view' ? null : current));
    };
    const setFileOpen = (open: boolean): void => {
        setActiveMenu((current): ActiveMenu => (open ? 'file' : current === 'file' ? null : current));
    };
    useEffect((): void => {
        if (fileOpen && !modalOpen) void onRefreshRecentItems?.();
    }, [fileOpen, modalOpen, onRefreshRecentItems]);
    const setAboutOpen = (open: boolean): void => {
        setActiveMenu((current): ActiveMenu => (open ? 'about' : current === 'about' ? null : current));
    };

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
     * green. Deriving all three from `fileActionInvoker` + `fileActionDisabled`
     * makes advertising a shortcut and dispatching it the same act.
     */
    const fileActionInvoker = useCallback(
        (id: ActionId): (() => Promise<unknown> | unknown) | undefined =>
            id === 'new-file'
                ? onNewDocument
                : id === 'new-window'
                  ? onNewWindow
                  : id === 'open-file'
                    ? onOpenDocument
                    : id === 'open-folder'
                      ? onOpenFolder
                      : id === 'close-folder'
                        ? onCloseFolder
                        : id === 'save'
                          ? onSave
                          : id === 'save-as'
                            ? onSaveAs
                            : id === 'close-tab'
                              ? onCloseDocument
                              : id === 'reopen'
                                ? onReopenLastFile
                                : id === 'exit'
                                  ? onQuit
                                  : undefined,
        [
            onCloseDocument,
            onCloseFolder,
            onNewDocument,
            onNewWindow,
            onOpenDocument,
            onOpenFolder,
            onQuit,
            onReopenLastFile,
            onSave,
            onSaveAs,
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
     * The id set is deliberate rather than an unconditional invoker check:
     * `fileActionInvoker` also returns undefined for `open-recent` and the
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
            (FILE_ACTIONS_WITH_INVOKERS.has(id) && fileActionInvoker(id) === undefined),
        [documentId, fileActionInvoker, modalOpen, projectedState, writable, workspaceOpen],
    );

    const actions = useMemo(
        () =>
            createShellActionCatalogue({
                modalOpen,
                viewAvailable: viewMenuProps !== undefined,
                openSettings: (): void => {
                    setViewOpen(false);
                    setSettingsOpen(true);
                },
                openView: (): void => {
                    setSettingsOpen(false);
                    setViewOpen(true);
                },
                openAbout: (): void => {
                    setSettingsOpen(false);
                    setViewOpen(false);
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
                toggleFullscreen,
            }),
        [modalOpen, onAbout, onShortcuts, toggleFullscreen, viewMenuProps],
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
                const invoke = fileActionInvoker(item.id);
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
            fileActionInvoker,
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
            action.id !== 'keyboard-shortcuts' &&
            (action.id !== 'view' || viewMenuProps !== undefined),
    );
    const fileActions = actionsForSurface('file-menu');
    const formatActions = actionsForSurface('format-menu');
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
        const invoke = fileActionInvoker(id);
        if (invoke === undefined) return;

        void dispatchAction(id, {
            applicationFocused: true,
            documentId,
            invoke,
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
            invoke: async (): Promise<unknown> => onOpenRecentItem(item),
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
                                        label={t('shell.format')}
                                        onSelect={(): void => {
                                            setOverflowOpen(false);
                                            setFormatOpen(true);
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
                                                dispatch(item);
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
                                    {fileActions
                                        .filter((item) => item.id !== 'clear-recent')
                                        .map((item) => (
                                            <Fragment key={item.id}>
                                                {menuDecoration(item.id)}
                                                {item.id === 'open-recent' ? (
                                                    noRecentItems ? (
                                                        recentEmptyMessage(styles.subItem)
                                                    ) : (
                                                        displayedRecentItems.map((item) => (
                                                            <MenuItem
                                                                className={styles.subItem}
                                                                icon={
                                                                    <Icon
                                                                        aria-hidden="true"
                                                                        className={styles.subItemIcon}
                                                                        name={item.kind}
                                                                    />
                                                                }
                                                                key={'recent-' + item.path}
                                                                label={
                                                                    <span className={styles.subItemLabel}>
                                                                        {safeRecentLabel(item.path)}
                                                                    </span>
                                                                }
                                                                title={item.path}
                                                                onSelect={(): void => dispatchRecentItem(item)}
                                                            />
                                                        ))
                                                    )
                                                ) : item.id === 'reopen' ? (
                                                    <MenuItem
                                                        aria-label={t(item.labelKey)}
                                                        className={styles.subItem}
                                                        accelerator={shortcutForMenuItem(item.shortcut)}
                                                        disabled={fileActionDisabled(item.id)}
                                                        label={
                                                            <span className={styles.subItemLabel}>
                                                                {'↺ ' + fileActionLabel(item)}
                                                            </span>
                                                        }
                                                        onSelect={(): void => dispatchFileAction(item.id)}
                                                    />
                                                ) : (
                                                    <MenuItem
                                                        aria-label={t(item.labelKey)}
                                                        accelerator={shortcutForMenuItem(item.shortcut)}
                                                        disabled={fileActionDisabled(item.id)}
                                                        label={fileActionLabel(item)}
                                                        onSelect={(): void => dispatchFileAction(item.id)}
                                                    />
                                                )}
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
                                <FormatMenu
                                    actions={formatActions}
                                    markdownSettingsLoaded={formatMenuProps?.markdownSettingsLoaded ?? false}
                                    projectedState={formatMenuProps?.projectedState ?? projectedState}
                                    slot={formatMenuProps?.slot ?? { state: 'idle' }}
                                    capture={formatMenuProps?.capture}
                                    onExecute={formatMenuProps?.onExecute}
                                    onCancel={formatMenuProps?.onCancel}
                                    open={!modalOpen && formatOpen}
                                    onOpenChange={setFormatOpen}
                                    showTrigger={false}
                                    anchorElement={overflowTrigger}
                                />
                                {viewMenuProps === undefined ? null : (
                                    <ViewMenu
                                        {...viewMenuProps}
                                        modal={false}
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
                                    {fileActions
                                        .filter((item) => item.id !== 'clear-recent')
                                        .map((item) => (
                                            <Fragment key={item.id}>
                                                {menuDecoration(item.id)}
                                                {item.id === 'open-recent' ? (
                                                    noRecentItems ? (
                                                        recentEmptyMessage(styles.subItem)
                                                    ) : (
                                                        displayedRecentItems.map((item) => (
                                                            <MenuItem
                                                                className={styles.subItem}
                                                                icon={
                                                                    <Icon
                                                                        aria-hidden="true"
                                                                        className={styles.subItemIcon}
                                                                        name={item.kind}
                                                                    />
                                                                }
                                                                key={'recent-' + item.path}
                                                                label={
                                                                    <span className={styles.subItemLabel}>
                                                                        {safeRecentLabel(item.path)}
                                                                    </span>
                                                                }
                                                                title={item.path}
                                                                onSelect={(): void => dispatchRecentItem(item)}
                                                            />
                                                        ))
                                                    )
                                                ) : item.id === 'reopen' ? (
                                                    <MenuItem
                                                        aria-label={t(item.labelKey)}
                                                        className={styles.subItem}
                                                        accelerator={shortcutForMenuItem(item.shortcut)}
                                                        disabled={fileActionDisabled(item.id)}
                                                        label={
                                                            <span className={styles.subItemLabel}>
                                                                {'↺ ' + fileActionLabel(item)}
                                                            </span>
                                                        }
                                                        onSelect={(): void => dispatchFileAction(item.id)}
                                                    />
                                                ) : (
                                                    <MenuItem
                                                        aria-label={t(item.labelKey)}
                                                        accelerator={shortcutForMenuItem(item.shortcut)}
                                                        disabled={fileActionDisabled(item.id)}
                                                        label={fileActionLabel(item)}
                                                        onSelect={(): void => dispatchFileAction(item.id)}
                                                    />
                                                )}
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
                                </Popup>

                                <FormatMenu
                                    actions={formatActions}
                                    markdownSettingsLoaded={formatMenuProps?.markdownSettingsLoaded ?? false}
                                    projectedState={formatMenuProps?.projectedState ?? projectedState}
                                    slot={formatMenuProps?.slot ?? { state: 'idle' }}
                                    capture={formatMenuProps?.capture}
                                    onExecute={formatMenuProps?.onExecute}
                                    onCancel={formatMenuProps?.onCancel}
                                    open={!modalOpen && formatOpen}
                                    onOpenChange={setFormatOpen}
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
                                        modal={false}
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
                                    pressed={viewMenuProps.workspaceVisible ?? true}
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
