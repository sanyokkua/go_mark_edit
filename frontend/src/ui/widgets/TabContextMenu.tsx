import { useEffect, useRef } from 'react';

import { dispatchAction } from '../../logic/actions/actionDispatcher';
import {
  actionsForSurface,
  getAction,
  getActionAvailability,
  type ActionAvailabilityContext,
  type ActionId,
  type ProjectedActionState,
} from '../../logic/actions/actionRegistry';
import type {
  ClassifiedError,
  DocumentMetadata,
  PathCommandResult,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import { t } from '../../i18n';
import styles from './DocumentTabs.module.css';

export interface TabContextAdapter {
  closeDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<TabTransitionResult>;
  reorderDocument?: (
    documentId: string,
    targetIndex: number,
    expectedTabSetRevision: number,
  ) => Promise<TabTransitionResult>;
  copyPath?: (documentId: string) => Promise<PathCommandResult>;
  revealInFileManager?: (documentId: string) => Promise<PathCommandResult>;
}

export type TabContextAction =
  | 'close-tab'
  | 'close-others'
  | 'close-right'
  | 'move-tab-left'
  | 'move-tab-right'
  | 'copy-path'
  | 'reveal-in-file-manager';

function isTabContextAction(actionId: ActionId): actionId is TabContextAction {
  return (
    actionId === 'close-tab' ||
    actionId === 'close-others' ||
    actionId === 'close-right' ||
    actionId === 'move-tab-left' ||
    actionId === 'move-tab-right' ||
    actionId === 'copy-path' ||
    actionId === 'reveal-in-file-manager'
  );
}

export interface TabContextMenuProps {
  adapter: TabContextAdapter;
  document: DocumentMetadata;
  index: number;
  orderedDocuments: readonly DocumentMetadata[];
  tabSetRevision: number;
  onAction: (
    action: TabContextAction,
    document: DocumentMetadata,
    targetIndex?: number,
  ) => Promise<unknown>;
  onClose: (options?: TabContextCloseOptions) => void;
}

export interface TabContextCloseOptions {
  /**
   * Hold the focus restoration until the application is in the foreground.
   *
   * Only a *successful* Reveal sets this. FR-FT-037 defers restoration "since
   * the file manager may briefly own it", and a Reveal that was refused or is
   * unavailable never handed the foreground to anyone — deferring that would
   * strand focus until the user happened to switch away and back.
   */
  deferFocusRestore?: boolean;
}

function errorResult(error: ClassifiedError | undefined): string {
  return error?.message ?? 'The tab command could not be completed.';
}

function parityRoute(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case')
  );
}

function parityLabel(actionId: TabContextAction): string {
  switch (actionId) {
    case 'close-tab':
      return t('editor.tab.context.close');
    case 'close-others':
      return t('editor.tab.context.closeOthers');
    case 'close-right':
      return t('editor.tab.context.closeRight');
    case 'copy-path':
      return t('editor.tab.context.copyPath');
    case 'reveal-in-file-manager':
      return t('editor.tab.context.reveal');
    default:
      return '';
  }
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({
  adapter,
  document,
  index,
  orderedDocuments,
  tabSetRevision,
  onAction,
  onClose,
}: TabContextMenuProps): React.JSX.Element => {
  void adapter;
  const isParityRoute = parityRoute();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);
  const menuActions = actionsForSurface('tab-context')
    .map((entry) => entry.id)
    .filter(isTabContextAction);

  /*
   * T152: the rules below used to be recomputed here — `if (index === 0)
   * unavailable.add('move-tab-left')` and five more — beside an identical set
   * in `getActionAvailability`. They agreed, which is exactly how the
   * `SettingsMenu` availability bug survived review: a second copy is right
   * until the registry changes and nobody remembers this one exists. The menu
   * now projects its own strip into the shape the registry reads and asks it.
   */
  const projectedState: ProjectedActionState = {
    documents: Object.fromEntries(
      orderedDocuments.map((entry) => [
        entry.documentId,
        { detached: entry.detached === true, path: entry.path },
      ]),
    ),
    orderedDocumentIds: orderedDocuments.map((entry) => entry.documentId),
  };
  const availabilityContext = (
    actionId: TabContextAction,
  ): ActionAvailabilityContext => ({
    documentId: document.documentId,
    projectedState,
    tabCommand: true,
    targetDocumentId: document.documentId,
    ...(actionId === 'move-tab-left'
      ? { targetIndex: index - 1 }
      : actionId === 'move-tab-right'
        ? { targetIndex: index + 1 }
        : {}),
  });
  const isUnavailable = (actionId: TabContextAction): boolean =>
    getActionAvailability(actionId, availabilityContext(actionId)).kind !==
    'available';

  useEffect((): void => {
    firstActionRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect((): (() => void) => {
    const dismiss = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    globalThis.document.addEventListener('pointerdown', dismiss);
    globalThis.document.addEventListener('keydown', escape);
    return (): void => {
      globalThis.document.removeEventListener('pointerdown', dismiss);
      globalThis.document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const activate = (actionId: TabContextAction): void => {
    if (isUnavailable(actionId)) return;
    void dispatchAction(actionId, {
      ...availabilityContext(actionId),
      sessionDocumentId: document.documentId,
      expectedTabSetRevision: tabSetRevision,
      invoke: async (): Promise<unknown> => {
        try {
          return await onAction(
            actionId,
            document,
            actionId === 'move-tab-left'
              ? index - 1
              : actionId === 'move-tab-right'
                ? index + 1
                : undefined,
          );
        } catch (error) {
          return {
            status: 'unavailable',
            reason: errorResult(error as ClassifiedError),
          };
        }
      },
    }).then(
      (result): void => {
        /*
         * `mutated` is what the dispatcher reports for a Reveal the host
         * accepted: `revealed` matches none of its refusal branches. FR-FT-037
         * treats OS acceptance as success, and success is the only outcome that
         * owes the deferred restoration.
         */
        onClose({
          deferFocusRestore:
            actionId === 'reveal-in-file-manager' &&
            result.status === 'mutated',
        });
      },
      (): void => {
        onClose();
      },
    );
  };

  return (
    <div
      aria-label={t('editor.tab.contextMenu')}
      className={styles.contextMenu}
      data-viewport-popup="tab-menu"
      ref={menuRef}
      role="menu"
      onKeyDown={(event): void => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const buttons = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          ) ?? [],
        );
        const current = buttons.indexOf(event.target as HTMLButtonElement);
        const next =
          event.key === 'ArrowDown'
            ? (current + 1) % buttons.length
            : (current - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {menuActions.map((actionId) => {
        const entry = getAction(actionId);
        const disabled = isUnavailable(actionId);
        return (
          <button
            aria-disabled={disabled || undefined}
            className={styles.contextMenuItem}
            data-action-id={entry.id}
            disabled={disabled}
            key={actionId}
            ref={actionId === 'close-tab' ? firstActionRef : undefined}
            role="menuitem"
            type="button"
            onClick={(): void => activate(actionId)}
          >
            {isParityRoute ? parityLabel(actionId) : t(entry.labelKey)}
            {isParityRoute && actionId === 'close-tab' ? (
              <span className={styles.parityAccelerator}>
                {t('editor.tab.context.closeAccelerator')}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

export default TabContextMenu;
