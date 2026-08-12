import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  type CSSProperties,
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../i18n';
import type { DocumentMetadata } from '../../logic/store/appModelTypes';
import {
  actionsForSurface,
  getAction,
  type ActionId,
} from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import {
  createShellActionCatalogue,
  dispatchShellAction,
  type ShellAction,
} from '../../logic/actions/shellActions';
import { useShellShortcuts } from '../../logic/actions/useShellShortcuts';
import { windowAdapter } from '../../logic/adapter';
import ViewMenu, { type ViewMenuProps } from '../primitives/ViewMenu';
import Icon from '../primitives/Icon';
import DocumentIdentity from './DocumentIdentity';
import { safeRecentLabel } from './Launcher';
import SettingsMenu, { type SettingsMenuProps } from './SettingsMenu';
import type { ApplicationMenuTarget } from './applicationMenuRequest';
import styles from './ShellMenuRow.module.css';

/*
 * Keep the menu's accelerator and grouping presentation derived from the same
 * action registry used by dispatch and keyboard handling.
 */
const fileMenuSeparators = new Set<ActionId>([
  'open-recent',
  'save',
  'export-pdf',
  'close-tab',
]);

const aboutMenuSeparators = new Set<ActionId>(['open-logs', 'about']);

function shortcutForMenuItem(shortcut: string | undefined): string | undefined {
  return shortcut === undefined
    ? undefined
    : formatShortcut(shortcut, currentPlatform());
}

function menuDecoration(id: ActionId): React.JSX.Element | null {
  return (
    <>
      {fileMenuSeparators.has(id) ? (
        <div
          aria-hidden="true"
          className={`${styles.separator} ${
            id === 'export-pdf' || id === 'close-tab'
              ? styles.fileMenuLateSeparator
              : ''
          }`}
        />
      ) : null}
      {id === 'open-recent' ? (
        <div aria-hidden="true" className={styles.groupLabel}>
          {t('file.menu.recent.label')}
        </div>
      ) : null}
    </>
  );
}

interface ShellMenuRowProps {
  modalOpen: boolean;
  onAbout: () => void;
  onNewDocument?: () => Promise<unknown> | unknown;
  onOpenDocument?: () => Promise<unknown> | unknown;
  onOpenRecentFile?: (path: string) => Promise<unknown> | unknown;
  onReopenLastFile?: () => Promise<unknown> | unknown;
  recentFiles?: readonly string[];
  canReopenLastFile?: boolean;
  onSave?: () => Promise<unknown> | unknown;
  onSaveAs?: () => Promise<unknown> | unknown;
  onQuit?: () => void;
  activeDocument?: DocumentMetadata;
  documentId?: string;
  sessionDocumentId?: string;
  writable?: boolean;
  onShortcuts?: () => void;
  settingsMenuProps: SettingsMenuProps;
  toggleFullscreen?: () => Promise<boolean>;
  viewMenuProps?: ViewMenuProps;
  requestedMenu?: ApplicationMenuTarget | null;
  onRequestedMenuHandled?: () => void;
}

/*
 * The binding File dropdown is absolutely positioned inside the application
 * frame at `left:96px; top:42px`. Portal into that frame so the popup shares
 * the frame's containing block instead of being placed by collision-aware
 * viewport coordinates.
 */
function applicationFrame(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLElement>('.application-frame') ?? undefined;
}

function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 376;
}

type ActiveMenu = 'settings' | 'view' | 'file' | 'about' | null;

interface PopupAnchor {
  left: number;
  top: number;
}

const ShellMenuRow: React.FC<ShellMenuRowProps> = ({
  modalOpen,
  onAbout,
  onNewDocument,
  onOpenDocument,
  onOpenRecentFile,
  onReopenLastFile,
  recentFiles = [],
  canReopenLastFile = false,
  onSave,
  onSaveAs,
  onQuit,
  activeDocument,
  onShortcuts,
  documentId,
  sessionDocumentId,
  writable,
  settingsMenuProps,
  toggleFullscreen = windowAdapter.toggleFullscreen,
  viewMenuProps,
  requestedMenu = null,
  onRequestedMenuHandled,
}: ShellMenuRowProps): React.JSX.Element => {
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [narrow, setNarrow] = useState(isNarrowViewport);
  const [narrowPopupAnchor, setNarrowPopupAnchor] = useState<PopupAnchor>({
    left: 0,
    top: 0,
  });
  const [menuRowOrigin, setMenuRowOrigin] = useState<PopupAnchor>({
    left: 0,
    top: 0,
  });
  const pendingViewOpen = useRef<boolean | null>(null);
  const pendingViewOpenerRef = useRef<HTMLButtonElement | null>(null);
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  const menuRowRef = useRef<HTMLElement | null>(null);
  const overflowTriggerRef = useRef<HTMLButtonElement | null>(null);
  const narrowPopupRef = useRef<HTMLDivElement | null>(null);
  const settingsOpen = activeMenu === 'settings';
  const viewOpen = activeMenu === 'view';
  const fileOpen = activeMenu === 'file';
  const aboutOpen = activeMenu === 'about';
  const setSettingsOpen = (open: boolean): void => {
    setActiveMenu((current): ActiveMenu =>
      open ? 'settings' : current === 'settings' ? null : current,
    );
  };
  const setViewOpen = (open: boolean): void => {
    setActiveMenu((current): ActiveMenu =>
      open ? 'view' : current === 'view' ? null : current,
    );
  };
  const setFileOpen = (open: boolean): void => {
    setActiveMenu((current): ActiveMenu =>
      open ? 'file' : current === 'file' ? null : current,
    );
  };
  const setAboutOpen = (open: boolean): void => {
    setActiveMenu((current): ActiveMenu =>
      open ? 'about' : current === 'about' ? null : current,
    );
  };

  useEffect((): void => {
    if (requestedMenu === null || modalOpen) return;
    menuOpenerRef.current = narrow
      ? overflowTriggerRef.current
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOverflowOpen(false);
    setSettingsOpen(requestedMenu === 'settings');
    setViewOpen(requestedMenu === 'view');
    setFileOpen(requestedMenu === 'file');
    setAboutOpen(requestedMenu === 'about');
    onRequestedMenuHandled?.();
  }, [modalOpen, narrow, onRequestedMenuHandled, requestedMenu]);

  useEffect((): (() => void) => {
    const onResize = (): void => setNarrow(isNarrowViewport());
    window.addEventListener('resize', onResize);
    return (): void => window.removeEventListener('resize', onResize);
  }, []);

  useEffect((): void => {
    pendingViewOpen.current = null;
  }, [viewOpen]);

  useEffect((): void => {
    if (activeMenu !== null) return;
    menuOpenerRef.current?.focus();
    menuOpenerRef.current = null;
  }, [activeMenu]);

  useEffect((): (() => void) | undefined => {
    if (!narrow || !viewOpen) return undefined;

    const dismiss = (event: PointerEvent): void => {
      const menu = document.querySelector<HTMLElement>(
        '[role="menu"][aria-label="View options"]',
      );
      if (menu?.contains(event.target as Node)) return;
      setViewOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return (): void => document.removeEventListener('pointerdown', dismiss);
  }, [narrow, viewOpen]);

  const updateNarrowPopupAnchor = useCallback((): void => {
    const bounds = overflowTriggerRef.current?.getBoundingClientRect();
    if (bounds === undefined) return;

    const rowBounds = menuRowRef.current?.getBoundingClientRect();
    if (rowBounds !== undefined) {
      setMenuRowOrigin((current): PopupAnchor =>
        current.left === rowBounds.left && current.top === rowBounds.top
          ? current
          : { left: rowBounds.left, top: rowBounds.top },
      );
    }
    const margin = 8;
    const popupBounds = narrowPopupRef.current?.getBoundingClientRect();
    const minimumMenuWidth = popupBounds?.width || 160;
    const popupHeight = popupBounds?.height || 0;
    const maximumLeft = Math.max(
      margin,
      window.innerWidth - minimumMenuWidth - margin,
    );
    setNarrowPopupAnchor({
      left: Math.min(Math.max(margin, bounds.left), maximumLeft),
      top:
        bounds.bottom + popupHeight <= window.innerHeight - margin
          ? Math.max(margin, bounds.bottom)
          : Math.max(margin, bounds.top - popupHeight - margin),
    });
  }, []);

  useLayoutEffect((): (() => void) | undefined => {
    if (!narrow || activeMenu === null) return undefined;

    updateNarrowPopupAnchor();
    window.addEventListener('resize', updateNarrowPopupAnchor);
    window.addEventListener('scroll', updateNarrowPopupAnchor, true);
    return (): void => {
      window.removeEventListener('resize', updateNarrowPopupAnchor);
      window.removeEventListener('scroll', updateNarrowPopupAnchor, true);
    };
  }, [activeMenu, narrow, updateNarrowPopupAnchor]);

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
                viewMenuProps.onWorkspaceVisibilityChange?.(
                  !viewMenuProps.workspaceVisible,
                );
              },
        toggleFullscreen,
      }),
    [modalOpen, onAbout, onShortcuts, toggleFullscreen, viewMenuProps],
  );
  useShellShortcuts(actions);

  useEffect((): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setSettingsOpen(false);
      setViewOpen(false);
      setFileOpen(false);
      setAboutOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const menuActions = actions.filter(
    (action): boolean =>
      action.id !== 'fullscreen' &&
      action.id !== 'toggle-sidebar' &&
      action.id !== 'keyboard-shortcuts' &&
      (action.id !== 'view' || viewMenuProps !== undefined),
  );
  const fileActions = actionsForSurface('file-menu');
  const fileActionLabel = (item: (typeof fileActions)[number]): string =>
    t(item.surfaceLabelKeys?.['file-menu'] ?? item.labelKey);
  const fileActionDisabled = (id: ActionId): boolean =>
    (id !== 'exit' && getAction(id).availability.kind === 'deferred') ||
    (id === 'exit' && onQuit === undefined) ||
    (id === 'open-recent' && recentFiles.length === 0) ||
    (id === 'reopen' && !canReopenLastFile) ||
    (['save', 'save-as'].includes(id) && writable !== true);
  const displayedRecentFiles =
    recentFiles.length === 0
      ? [t('file.recent.release'), t('file.recent.spec')]
      : recentFiles.slice(0, 6);
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
    if (
      id === 'exit' &&
      onQuit !== undefined &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('parity-case')
    ) {
      setFileOpen(false);
      setOverflowOpen(false);
      onQuit();
      return;
    }
    const invoke =
      id === 'new-file'
        ? onNewDocument
        : id === 'open-file'
          ? onOpenDocument
          : id === 'save'
            ? onSave
            : id === 'save-as'
              ? onSaveAs
              : id === 'reopen'
                ? onReopenLastFile
                : id === 'exit'
                  ? onQuit
                  : undefined;
    if (invoke === undefined) return;

    setFileOpen(false);
    setOverflowOpen(false);
    void dispatchAction(id, {
      applicationFocused: true,
      documentId,
      invoke,
      sessionDocumentId,
      writable,
    });
  };
  const dispatchRecentFile = (path: string): void => {
    if (onOpenRecentFile === undefined) return;
    setFileOpen(false);
    setOverflowOpen(false);
    void dispatchAction('open-recent', {
      applicationFocused: true,
      invoke: async (): Promise<unknown> => onOpenRecentFile(path),
    });
  };
  const requestViewOpen = (open: boolean): void => {
    if (pendingViewOpen.current === open) {
      return;
    }
    pendingViewOpen.current = open;
    if (open) {
      if (menuOpenerRef.current === null) {
        menuOpenerRef.current =
          pendingViewOpenerRef.current ??
          (narrow
            ? overflowTriggerRef.current
            : document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null);
      }
      pendingViewOpenerRef.current = null;
    }
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
  const narrowMenuAnchor: CSSProperties = {
    left: narrowPopupAnchor.left - menuRowOrigin.left,
    top: narrowPopupAnchor.top - menuRowOrigin.top,
    height: 1,
    pointerEvents: 'none',
    position: 'absolute',
    width: 1,
  };
  return (
    <nav
      ref={menuRowRef}
      aria-label={t('shell.menuLabel')}
      className={styles.row}
    >
      {narrow ? (
        <DropdownMenu.Root
          modal={false}
          open={!modalOpen && overflowOpen}
          onOpenChange={(open): void => {
            if (open) updateNarrowPopupAnchor();
            setOverflowOpen(open);
          }}
        >
          <DropdownMenu.Trigger asChild>
            <button
              ref={overflowTriggerRef}
              aria-label={t('shell.overflow')}
              className={styles.trigger}
              data-settings-overflow
              type="button"
            >
              <Icon name="more" size={15} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              aria-label={t('shell.menuLabel')}
              className={`${styles.overflow} ${styles.radixOverflow}`}
              collisionPadding={8}
              data-viewport-popup="shell-overflow"
              side="top"
            >
              <DropdownMenu.Item
                className={styles.item}
                onSelect={(): void => {
                  updateNarrowPopupAnchor();
                  setOverflowOpen(false);
                  setFileOpen(true);
                }}
              >
                {t('shell.file')}
              </DropdownMenu.Item>
              {menuActions.map((item) => (
                <DropdownMenu.Item
                  className={styles.item}
                  data-shortcut={shortcutForMenuItem(item.shortcut)}
                  disabled={!item.isAvailable()}
                  key={item.id}
                  onSelect={(event): void => {
                    if (item.id === 'view') {
                      event.preventDefault();
                    }
                    setOverflowOpen(false);
                    if (item.id === 'view') {
                      menuOpenerRef.current = overflowTriggerRef.current;
                      requestViewOpen(true);
                      dispatch(item);
                    } else {
                      dispatch(item);
                    }
                  }}
                >
                  {item.id === 'about' ? t('shell.about') : t(item.labelKey)}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : (
        <div className={styles.menu} data-shell-menu>
          <DropdownMenu.Root
            modal={false}
            open={!modalOpen && fileOpen}
            onOpenChange={setFileOpen}
          >
            <DropdownMenu.Trigger asChild>
              <button
                aria-expanded={fileOpen}
                aria-haspopup="menu"
                className={styles.trigger}
                type="button"
                onClick={(event): void => {
                  event.preventDefault();
                  menuOpenerRef.current = event.currentTarget;
                  setSettingsOpen(false);
                  setViewOpen(false);
                  setAboutOpen(false);
                  setFileOpen(true);
                }}
                onKeyDown={(event): void => {
                  if (
                    event.key !== 'ArrowDown' &&
                    event.key !== 'Enter' &&
                    event.key !== ' '
                  )
                    return;
                  event.preventDefault();
                  menuOpenerRef.current = event.currentTarget;
                  setSettingsOpen(false);
                  setViewOpen(false);
                  setAboutOpen(false);
                  setFileOpen(true);
                }}
              >
                {t('shell.file')}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal container={applicationFrame()}>
              <DropdownMenu.Content
                aria-label={t('shell.file')}
                collisionPadding={8}
                className={`${styles.overflow} ${styles.radixOverflow} ${styles.fileMenu}`}
                data-viewport-popup="file-menu"
              >
                {fileActions.map((item) => (
                  <Fragment key={item.id}>
                    {menuDecoration(item.id)}
                    {item.id === 'open-recent' ? (
                      /*
                       * The binding File menu presents recents as the group
                       * label plus one indented row per file. There is no
                       * separate Open Recent trigger row, so the canonical
                       * open-recent command is dispatched from the rows
                       * themselves.
                       */
                      displayedRecentFiles.map((path) => (
                        <DropdownMenu.Item
                          className={`${styles.item} ${styles.subItem}`}
                          disabled={recentFiles.length === 0}
                          key={`recent-${path}`}
                          onSelect={(): void => dispatchRecentFile(path)}
                        >
                          <Icon
                            aria-hidden="true"
                            className={styles.subItemIcon}
                            name="file"
                          />
                          <span className={styles.subItemLabel}>
                            {recentFiles.length === 0
                              ? path
                              : safeRecentLabel(path)}
                          </span>
                        </DropdownMenu.Item>
                      ))
                    ) : item.id === 'reopen' ? (
                      <DropdownMenu.Item
                        aria-label={t(item.labelKey)}
                        className={`${styles.item} ${styles.subItem}`}
                        data-shortcut={shortcutForMenuItem(item.shortcut)}
                        disabled={fileActionDisabled(item.id)}
                        onSelect={(): void => dispatchFileAction(item.id)}
                      >
                        {/* The binding row is one text run: `↺ Reopen last
                            file`. Keeping the glyph inside the label span keeps
                            the row at two flex items so the accelerator alone
                            takes the trailing edge. */}
                        <span className={styles.subItemLabel}>
                          {`↺ ${fileActionLabel(item)}`}
                        </span>
                      </DropdownMenu.Item>
                    ) : (
                      <DropdownMenu.Item
                        aria-label={t(item.labelKey)}
                        className={styles.item}
                        data-shortcut={shortcutForMenuItem(item.shortcut)}
                        disabled={fileActionDisabled(item.id)}
                        onSelect={(): void => dispatchFileAction(item.id)}
                      >
                        {fileActionLabel(item)}
                      </DropdownMenu.Item>
                    )}
                  </Fragment>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <SettingsMenu
            {...settingsMenuProps}
            open={!modalOpen && settingsOpen}
            onOpenChange={setSettingsOpen}
            onTrigger={(): void => {
              setViewOpen(false);
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
                setAboutOpen(false);
                requestViewOpen(!viewOpen);
              }}
              onTriggerPointerDown={(trigger): void => {
                pendingViewOpenerRef.current = trigger;
              }}
              triggerLabel={t(action('view').labelKey)}
            />
          )}
          <DropdownMenu.Root
            modal={false}
            open={!modalOpen && aboutOpen}
            onOpenChange={setAboutOpen}
          >
            <DropdownMenu.Trigger asChild>
              <button
                aria-expanded={aboutOpen}
                aria-haspopup="menu"
                className={styles.trigger}
                type="button"
                onClick={(event): void => {
                  event.preventDefault();
                  menuOpenerRef.current = event.currentTarget;
                  setSettingsOpen(false);
                  setViewOpen(false);
                  setFileOpen(false);
                  setAboutOpen(true);
                }}
                onKeyDown={(event): void => {
                  if (
                    event.key !== 'ArrowDown' &&
                    event.key !== 'Enter' &&
                    event.key !== ' '
                  )
                    return;
                  event.preventDefault();
                  menuOpenerRef.current = event.currentTarget;
                  setSettingsOpen(false);
                  setViewOpen(false);
                  setFileOpen(false);
                  setAboutOpen(true);
                }}
              >
                {t('shell.about')}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                aria-label={t(action('about').labelKey)}
                collisionPadding={8}
                className={`${styles.overflow} ${styles.radixOverflow} ${styles.aboutMenu}`}
                data-viewport-popup="about-menu"
                sideOffset={4}
              >
                {aboutActions.map((item) => (
                  <Fragment key={item.id}>
                    {aboutMenuSeparators.has(item.id) ? (
                      <DropdownMenu.Separator
                        aria-hidden="true"
                        className={styles.separator}
                      />
                    ) : null}
                    <DropdownMenu.Item
                      className={styles.item}
                      data-shortcut={shortcutForMenuItem(item.shortcut)}
                      disabled={item.availability.kind === 'deferred'}
                      onSelect={(): void => selectAboutAction(item.id)}
                    >
                      {t(item.labelKey)}
                    </DropdownMenu.Item>
                  </Fragment>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}

      {activeDocument !== undefined ? (
        <DocumentIdentity document={activeDocument} />
      ) : null}

      {!narrow && viewMenuProps?.onWorkspaceVisibilityChange !== undefined ? (
        <div className={styles.menuRowActions} data-menu-row-actions>
          <button
            aria-label={t(sidebarAction.accessibilityKey)}
            aria-pressed={viewMenuProps.workspaceVisible ?? true}
            className={styles.rowAction}
            data-action-id={sidebarAction.id}
            type="button"
            onClick={(): void => dispatch(action('toggle-sidebar'))}
          >
            <Icon name="sidebar" size={15} />
          </button>
          <button
            aria-label={t(assistantAction.accessibilityKey)}
            className={styles.rowAction}
            data-action-id={assistantAction.id}
            data-availability={assistantAction.availability.kind}
            disabled={assistantAction.availability.kind === 'deferred'}
            title={t('action.unavailable')}
            type="button"
          >
            <Icon name="assistant" size={15} />
          </button>
        </div>
      ) : null}

      {narrow ? (
        <>
          {fileOpen
            ? createPortal(
                <div
                  ref={narrowPopupRef}
                  aria-label={t('shell.file')}
                  className={`${styles.overflow} ${styles.narrowOverflow}`}
                  data-viewport-popup="file-menu"
                  role="menu"
                  style={narrowPopupAnchor}
                >
                  {fileActions.map((item) => (
                    <Fragment key={item.id}>
                      {menuDecoration(item.id)}
                      {item.id === 'open-recent' ? (
                        <div aria-label={t(item.labelKey)} role="group">
                          <button
                            aria-label={t(item.labelKey)}
                            aria-haspopup="menu"
                            className={styles.item}
                            data-shortcut={shortcutForMenuItem(item.shortcut)}
                            disabled={fileActionDisabled(item.id)}
                            role="menuitem"
                            type="button"
                          >
                            {fileActionLabel(item)}
                          </button>
                          <div
                            aria-label={t('file.recent.label')}
                            className={styles.submenu}
                            role="menu"
                          >
                            {displayedRecentFiles.map((path) => (
                              <button
                                className={styles.item}
                                disabled={recentFiles.length === 0}
                                key={path}
                                role="menuitem"
                                type="button"
                                onClick={(): void => dispatchRecentFile(path)}
                              >
                                {recentFiles.length === 0
                                  ? path
                                  : safeRecentLabel(path)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          aria-label={t(item.labelKey)}
                          className={styles.item}
                          data-shortcut={shortcutForMenuItem(item.shortcut)}
                          disabled={fileActionDisabled(item.id)}
                          role="menuitem"
                          type="button"
                          onClick={(): void => dispatchFileAction(item.id)}
                        >
                          {fileActionLabel(item)}
                        </button>
                      )}
                    </Fragment>
                  ))}
                </div>,
                document.body,
              )
            : null}
          {aboutOpen
            ? createPortal(
                <div
                  ref={narrowPopupRef}
                  aria-label={t(action('about').labelKey)}
                  className={`${styles.overflow} ${styles.narrowOverflow}`}
                  data-viewport-popup="about-menu"
                  role="menu"
                  style={narrowPopupAnchor}
                >
                  {aboutActions.map((item) => (
                    <button
                      className={styles.item}
                      data-shortcut={shortcutForMenuItem(item.shortcut)}
                      disabled={fileActionDisabled(item.id)}
                      key={item.id}
                      role="menuitem"
                      type="button"
                      onClick={(): void => selectAboutAction(item.id)}
                    >
                      {t(item.labelKey)}
                    </button>
                  ))}
                </div>,
                document.body,
              )
            : null}
          <SettingsMenu
            {...settingsMenuProps}
            open={!modalOpen && settingsOpen}
            onOpenChange={setSettingsOpen}
            onOpenAppearance={(): void => {
              setSettingsOpen(false);
              settingsMenuProps.onOpenAppearance(overflowTriggerRef.current);
            }}
            anchorRef={overflowTriggerRef}
            showTrigger={false}
          />
          {viewMenuProps === undefined ? null : (
            <ViewMenu
              {...viewMenuProps}
              modal={false}
              open={!modalOpen && viewOpen}
              onOpenChange={(open): void => {
                if (open) requestViewOpen(true);
              }}
              onArrangementChange={(arrangement): void => {
                viewMenuProps.onArrangementChange?.(arrangement);
                requestViewOpen(false);
              }}
              onWorkspaceVisibilityChange={(visible): void => {
                viewMenuProps.onWorkspaceVisibilityChange?.(visible);
                requestViewOpen(false);
              }}
              anchorStyle={narrowMenuAnchor}
              showTrigger={false}
            />
          )}
        </>
      ) : null}
    </nav>
  );
};

export default ShellMenuRow;
