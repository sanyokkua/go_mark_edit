import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../i18n';
import {
  actionsForSurface,
  getAction,
  type ActionId,
} from '../../logic/actions/actionRegistry';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import {
  createShellActionCatalogue,
  dispatchShellAction,
  type ShellAction,
} from '../../logic/actions/shellActions';
import { useShellShortcuts } from '../../logic/actions/useShellShortcuts';
import { windowAdapter } from '../../logic/adapter';
import ViewMenu, { type ViewMenuProps } from '../primitives/ViewMenu';
import SettingsMenu, { type SettingsMenuProps } from './SettingsMenu';
import styles from './ShellMenuRow.module.css';

interface ShellMenuRowProps {
  modalOpen: boolean;
  onAbout: () => void;
  onNewDocument?: () => Promise<unknown> | unknown;
  onOpenDocument?: () => Promise<unknown> | unknown;
  onSave?: () => Promise<unknown> | unknown;
  onSaveAs?: () => Promise<unknown> | unknown;
  documentId?: string;
  sessionDocumentId?: string;
  writable?: boolean;
  onShortcuts?: () => void;
  settingsMenuProps: SettingsMenuProps;
  toggleFullscreen?: () => Promise<boolean>;
  viewMenuProps?: ViewMenuProps;
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
  onSave,
  onSaveAs,
  onShortcuts,
  documentId,
  sessionDocumentId,
  writable,
  settingsMenuProps,
  toggleFullscreen = windowAdapter.toggleFullscreen,
  viewMenuProps,
}: ShellMenuRowProps): React.JSX.Element => {
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [narrow, setNarrow] = useState(isNarrowViewport);
  const [narrowPopupAnchor, setNarrowPopupAnchor] = useState<PopupAnchor>({
    left: 0,
    top: 0,
  });
  const pendingViewOpen = useRef<boolean | null>(null);
  const pendingViewOpenerRef = useRef<HTMLButtonElement | null>(null);
  const menuOpenerRef = useRef<HTMLElement | null>(null);
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
  const fileActionDisabled = (id: ActionId): boolean =>
    getAction(id).availability.kind === 'deferred' ||
    (['save', 'save-as'].includes(id) && writable !== true);
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
    const invoke =
      id === 'new-file'
        ? onNewDocument
        : id === 'open-file'
          ? onOpenDocument
          : id === 'save'
            ? onSave
            : id === 'save-as'
              ? onSaveAs
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
    ...narrowPopupAnchor,
    height: 1,
    pointerEvents: 'none',
    position: 'fixed',
    width: 1,
  };
  return (
    <nav aria-label={t('shell.menuLabel')} className={styles.row}>
      {narrow ? (
        <DropdownMenu.Root
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
              <span aria-hidden="true">•••</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              aria-label={t('shell.menuLabel')}
              className={styles.overflow}
              collisionPadding={8}
              data-viewport-popup="shell-overflow"
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
                  disabled={!item.isAvailable()}
                  key={item.id}
                  onSelect={(event): void => {
                    if (item.id === 'view') {
                      event.preventDefault();
                    }
                    setOverflowOpen(false);
                    if (item.id === 'view') {
                      pendingViewOpen.current = true;
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
        <>
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
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                aria-label={t('shell.file')}
                collisionPadding={8}
                className={styles.overflow}
                data-viewport-popup="file-menu"
                sideOffset={4}
              >
                {fileActions.map((item) =>
                  item.id === 'open-recent' ? (
                    <DropdownMenu.Sub key={item.id}>
                      <DropdownMenu.SubTrigger
                        className={styles.item}
                        disabled={item.availability.kind === 'deferred'}
                      >
                        {t(item.labelKey)}
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent
                          className={styles.overflow}
                          collisionPadding={8}
                          data-viewport-popup="file-recent-menu"
                        >
                          <DropdownMenu.Item className={styles.item} disabled>
                            {t('file.recent.release')}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item className={styles.item} disabled>
                            {t('file.recent.spec')}
                          </DropdownMenu.Item>
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                  ) : (
                    <DropdownMenu.Item
                      className={styles.item}
                      disabled={fileActionDisabled(item.id)}
                      key={item.id}
                      onSelect={(): void => dispatchFileAction(item.id)}
                    >
                      {t(item.labelKey)}
                    </DropdownMenu.Item>
                  ),
                )}
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
                className={styles.overflow}
                data-viewport-popup="about-menu"
                sideOffset={4}
              >
                {aboutActions.map((item) => (
                  <DropdownMenu.Item
                    className={styles.item}
                    disabled={item.availability.kind === 'deferred'}
                    key={item.id}
                    onSelect={(): void => selectAboutAction(item.id)}
                  >
                    {t(item.labelKey)}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </>
      )}

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
            <span aria-hidden="true">☰</span>
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
            <span aria-hidden="true">✦</span>
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
                  {fileActions.map((item) =>
                    item.id === 'open-recent' ? (
                      <div
                        aria-label={t(item.labelKey)}
                        key={item.id}
                        role="group"
                      >
                        <button
                          aria-haspopup="menu"
                          className={styles.item}
                          disabled
                          role="menuitem"
                          type="button"
                        >
                          {t(item.labelKey)}
                        </button>
                        <div
                          aria-label={t('file.recent.label')}
                          className={styles.submenu}
                          role="menu"
                        >
                          <button
                            className={styles.item}
                            disabled
                            role="menuitem"
                            type="button"
                          >
                            {t('file.recent.release')}
                          </button>
                          <button
                            className={styles.item}
                            disabled
                            role="menuitem"
                            type="button"
                          >
                            {t('file.recent.spec')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={styles.item}
                        disabled={fileActionDisabled(item.id)}
                        key={item.id}
                        role="menuitem"
                        type="button"
                        onClick={(): void => dispatchFileAction(item.id)}
                      >
                        {t(item.labelKey)}
                      </button>
                    ),
                  )}
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
