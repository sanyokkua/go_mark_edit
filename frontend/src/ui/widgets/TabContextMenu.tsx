import { t } from '../../i18n';
import {
  dispatchAction,
  type ActionResult,
} from '../../logic/actions/actionDispatcher';
import {
  actionsForSurface,
  getAction,
  getActionAvailability,
  type ActionAvailabilityContext,
  type ActionId,
  type ProjectedActionState,
} from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import type {
  ClassifiedError,
  DocumentMetadata,
  PathCommandResult,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import type { PopupAnchor } from '../components/Popup';
import MenuItem from '../components/MenuItem';
import Popup from '../components/Popup';

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
  anchor?: PopupAnchor;
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
  deferFocusRestore?: boolean;
}

function acceleratorFor(actionId: TabContextAction): string | undefined {
  const binding = getAction(actionId).shortcut;
  return binding === undefined
    ? undefined
    : formatShortcut(binding, currentPlatform());
}

function errorResult(error: ClassifiedError | undefined): string {
  return error?.message ?? 'The tab command could not be completed.';
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({
  adapter,
  anchor = { point: { x: 0, y: 0 } },
  document,
  index,
  orderedDocuments,
  tabSetRevision,
  onAction,
  onClose,
}: TabContextMenuProps): React.JSX.Element => {
  void adapter;
  const menuActions = actionsForSurface('tab-context')
    .map((entry) => entry.id)
    .filter(isTabContextAction);

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
      (result: ActionResult): void => {
        onClose({
          deferFocusRestore:
            actionId === 'reveal-in-file-manager' &&
            result.status === 'mutated',
        });
      },
      (): void => onClose(),
    );
  };

  return (
    <Popup
      anchor={anchor}
      aria-label={t('editor.tab.contextMenu')}
      data-viewport-popup="tab-menu"
      initialFocus="first"
      open
      role="menu"
      size="menu"
      onOpenChange={(open): void => {
        if (!open) onClose();
      }}
    >
      {menuActions.map((actionId) => {
        const entry = getAction(actionId);
        const disabled = isUnavailable(actionId);
        const accelerator = acceleratorFor(actionId);
        return (
          <MenuItem
            accelerator={accelerator}
            aria-keyshortcuts={accelerator}
            aria-disabled={disabled || undefined}
            data-action-id={entry.id}
            disabled={disabled}
            key={actionId}
            label={t(entry.labelKey)}
            onSelect={(): void => activate(actionId)}
          />
        );
      })}
    </Popup>
  );
};

export default TabContextMenu;
