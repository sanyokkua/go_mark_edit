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
import {
  dispatchAction,
  type ActionResult,
} from '../../logic/actions/actionDispatcher';
import {
  createShellActionCatalogue,
  dispatchShellAction,
  type ShellAction,
} from '../../logic/actions/shellActions';
import {
  useShellShortcuts,
  type ShellShortcutAction,
  type ShortcutAction,
} from '../../logic/actions/useShellShortcuts';
import { windowAdapter } from '../../logic/adapter';
import AppBrand from '../primitives/AppBrand';
import ViewMenu, { type ViewMenuProps } from '../primitives/ViewMenu';
import Icon from '../primitives/Icon';
import MenuTrigger from '../primitives/MenuTrigger';
import DocumentIdentity from './DocumentIdentity';
import { safeRecentLabel } from './Launcher';
import { isMinimumWindow } from './minimumWindow';
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

/*
 * Exactly the ids `fileActionInvoker` can resolve to a handler. Membership here
 * means "this row is only real when its prop was supplied", which is what lets
 * `fileActionDisabled` grey the row instead of letting it render enabled and
 * inert. `open-recent` is absent on purpose: it has no invoker and its own
 * recent-count rule governs it.
 */
const FILE_ACTIONS_WITH_INVOKERS: ReadonlySet<ActionId> = new Set<ActionId>([
  'new-file',
  'open-file',
  'save',
  'save-as',
  'close-tab',
  'reopen',
  'exit',
]);

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
  onCloseDocument?: () => Promise<unknown> | unknown;
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
  /*
   * T109: the File surfaces' dispatch results, handed to whoever owns a store
   * dispatch rather than reported here. Keeping the row free of `logic/store`
   * follows `EditorContextMenu`'s existing `onActionResult` prop, and means the
   * row's own tests need no Provider.
   */
  onActionResult?: (result: ActionResult) => void;
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

/*
 * Deliberately the static read, not `useMinimumWindow`: the menu row samples
 * the width to place its popups, and re-rendering the row on every resize
 * would move an open popup out from under the pointer.
 */
const isNarrowViewport = isMinimumWindow;

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
  onCloseDocument,
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
  onActionResult,
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

  /*
   * A menu request arriving as a prop is state derived from that prop, so it is
   * adjusted during render rather than in an effect: opening a menu from an
   * effect schedules a second render pass for every request.
   */
  const [handledMenuRequest, setHandledMenuRequest] =
    useState<ApplicationMenuTarget | null>(requestedMenu);
  const pendingMenuOpener =
    requestedMenu !== handledMenuRequest &&
    requestedMenu !== null &&
    !modalOpen &&
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (requestedMenu !== handledMenuRequest) {
    setHandledMenuRequest(requestedMenu);
    if (requestedMenu !== null && !modalOpen) {
      setOverflowOpen(false);
      setActiveMenu(requestedMenu);
    }
  }

  useEffect((): void => {
    if (requestedMenu === null || modalOpen) return;
    // The opener is captured from the element focused when the request arrived,
    // before the menu takes focus; in the narrow shell the overflow trigger owns
    // the restoration target.
    menuOpenerRef.current = narrow
      ? overflowTriggerRef.current
      : (pendingMenuOpener ?? menuOpenerRef.current);
    onRequestedMenuHandled?.();
  }, [
    modalOpen,
    narrow,
    onRequestedMenuHandled,
    pendingMenuOpener,
    requestedMenu,
  ]);

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

  /*
   * One table behind three surfaces: the accelerator text drawn beside a File
   * row, the row's click, and the keystroke. T110 existed because the first was
   * read from the action registry while dispatch was read from a hand-written
   * catalogue of shell ids — two lists that drifted apart with every test still
   * green. Deriving all three from `fileActionInvoker` + `fileActionDisabled`
   * makes advertising a shortcut and dispatching it the same act.
   */
  const fileActionInvoker = useCallback(
    (id: ActionId): (() => Promise<unknown> | unknown) | undefined =>
      id === 'new-file'
        ? onNewDocument
        : id === 'open-file'
          ? onOpenDocument
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
      onNewDocument,
      onOpenDocument,
      onQuit,
      onReopenLastFile,
      onSave,
      onSaveAs,
    ],
  );
  const recentFileCount = recentFiles.length;
  /*
   * T111: a row whose handler is absent must grey out, never render enabled and
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
   * the same rule, so it is folded in — two spellings of one rule is the drift
   * T110 existed to remove.
   */
  const fileActionDisabled = useCallback(
    (id: ActionId): boolean =>
      (id !== 'exit' && getAction(id).availability.kind === 'deferred') ||
      (FILE_ACTIONS_WITH_INVOKERS.has(id) &&
        fileActionInvoker(id) === undefined) ||
      (id === 'open-recent' && recentFileCount === 0) ||
      (id === 'reopen' && !canReopenLastFile) ||
      (['save', 'save-as'].includes(id) && writable !== true),
    [canReopenLastFile, fileActionInvoker, recentFileCount, writable],
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
                viewMenuProps.onWorkspaceVisibilityChange?.(
                  !viewMenuProps.workspaceVisible,
                );
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
      actionsForSurface('file-menu').flatMap(
        (item): readonly ShortcutAction[] => {
          const invoke = fileActionInvoker(item.id);
          const { shortcut } = item;
          if (invoke === undefined || shortcut === undefined) return [];
          return [
            {
              dispatchContext: {
                applicationFocused: true,
                documentId,
                sessionDocumentId,
                writable,
              },
              id: item.id,
              invoke,
              isAvailable: (): boolean =>
                !modalOpen && !fileActionDisabled(item.id),
              onResult: (result: ActionResult): void =>
                onActionResult?.(result),
              shortcut,
            },
          ];
        },
      ),
    [
      documentId,
      fileActionDisabled,
      fileActionInvoker,
      modalOpen,
      onActionResult,
      sessionDocumentId,
      writable,
    ],
  );
  const shortcutActions = useMemo(
    (): readonly ShellShortcutAction[] => [...actions, ...fileShortcutActions],
    [actions, fileShortcutActions],
  );
  useShellShortcuts(shortcutActions);

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
  /*
   * FR-FT-042: with no recent files the menu shows the defined empty message.
   * It used to show two disabled rows named `release-notes.md` and
   * `spec-draft.md` instead — catalogue-backed, but invented filenames standing
   * in for data that does not exist, which reads as history the user does not
   * have.
   */
  const displayedRecentFiles = recentFiles.slice(0, 6);
  const noRecentFiles = displayedRecentFiles.length === 0;
  const recentEmptyMessage = (className: string): React.JSX.Element => (
    <div className={className} data-no-recent-files="true">
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
      <AppBrand />
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
            <MenuTrigger
              ref={overflowTriggerRef}
              aria-label={t('shell.overflow')}
              data-settings-overflow
              expanded={overflowOpen}
            >
              <Icon name="more" size={15} />
            </MenuTrigger>
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
              <MenuTrigger
                expanded={fileOpen}
                onClick={(event): void => {
                  event.preventDefault();
                  menuOpenerRef.current = event.currentTarget;
                  setSettingsOpen(false);
                  setViewOpen(false);
                  setAboutOpen(false);
                  setFileOpen(true);
                }}
                onOpen={(trigger): void => {
                  menuOpenerRef.current = trigger;
                  setSettingsOpen(false);
                  setViewOpen(false);
                  setAboutOpen(false);
                  setFileOpen(true);
                }}
              >
                {t('shell.file')}
              </MenuTrigger>
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
                      noRecentFiles ? (
                        recentEmptyMessage(`${styles.item} ${styles.subItem}`)
                      ) : (
                        displayedRecentFiles.map((path) => (
                          <DropdownMenu.Item
                            className={`${styles.item} ${styles.subItem}`}
                            key={`recent-${path}`}
                            onSelect={(): void => dispatchRecentFile(path)}
                          >
                            <Icon
                              aria-hidden="true"
                              className={styles.subItemIcon}
                              name="file"
                            />
                            <span className={styles.subItemLabel}>
                              {safeRecentLabel(path)}
                            </span>
                          </DropdownMenu.Item>
                        ))
                      )
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
              <MenuTrigger
                expanded={aboutOpen}
                onClick={(event): void => {
                  event.preventDefault();
                  menuOpenerRef.current = event.currentTarget;
                  setSettingsOpen(false);
                  setViewOpen(false);
                  setFileOpen(false);
                  setAboutOpen(true);
                }}
                onOpen={(trigger): void => {
                  menuOpenerRef.current = trigger;
                  setSettingsOpen(false);
                  setViewOpen(false);
                  setFileOpen(false);
                  setAboutOpen(true);
                }}
              >
                {t('shell.about')}
              </MenuTrigger>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal container={applicationFrame()}>
              <DropdownMenu.Content
                aria-label={t(action('about').labelKey)}
                collisionPadding={8}
                className={`${styles.overflow} ${styles.radixOverflow} ${styles.aboutMenu}`}
                data-viewport-popup="about-menu"
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

      {/* Binding source: mockup.html `.sp{flex:1}` (:231). One spacer, always
          present, is what pushes the identity and the window controls to the
          trailing edge — whether or not a document is open. */}
      <div aria-hidden="true" className={styles.spacer} />

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
                            {noRecentFiles
                              ? recentEmptyMessage(styles.item)
                              : displayedRecentFiles.map((path) => (
                                  <button
                                    className={styles.item}
                                    key={path}
                                    role="menuitem"
                                    type="button"
                                    onClick={(): void =>
                                      dispatchRecentFile(path)
                                    }
                                  >
                                    {safeRecentLabel(path)}
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
