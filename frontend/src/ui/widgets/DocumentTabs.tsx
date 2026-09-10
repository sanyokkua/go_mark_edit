import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { appModelAdapter, type AppModelAdapter } from '../../logic/adapter';
import type {
  ClosePlanKind,
  ConflictPreview,
  DocumentMetadata,
  DocumentTransitionResult,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { reportClassifiedError } from '../../logic/store/classifiedNotification';
import { actionsForSurface } from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  shortcutForKeyEvent,
} from '../../logic/actions/shortcutRegistry';
import { t } from '../../i18n';
import LiveRegion from '../primitives/LiveRegion';
import type { PopupAnchor } from '../components/Popup';
import TabBar from '../components/TabBar';
import TabContextMenu, {
  type TabContextAction,
  type TabContextAdapter,
  type TabContextCloseOptions,
} from './TabContextMenu';
import { EDITOR_TABPANEL_ID, tabElementId } from './editorTabPanel';
import { TabRemediationContext } from './tabRemediation';
import { whenApplicationRegainsForegroundFocus } from './foregroundFocus';
import { flushOutgoingDocument, outgoingFlushRefusal } from './outgoingFlush';
import {
  tabLabelsFor,
  truncatedTabLabelParts,
  type TabLabel,
} from './tabLabel';

export interface DocumentTabsProps {
  adapter?: Pick<
    AppModelAdapter,
    | 'activateDocument'
    | 'closeDocument'
    | 'copyPath'
    | 'reorderDocument'
    | 'revealInFileManager'
    | 'newDocument'
    | 'flushActiveSession'
  >;
  /** App-level owner of the foreground external-change prompt. */
  onExternalConflict?: (preview: ConflictPreview) => void;
  onActivateDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  onCloseDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
    kind?: ClosePlanKind,
    targetDocumentIds?: string[],
  ) => Promise<TabTransitionResult>;
  onNewDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
  modalOpen?: boolean;
}

function announcementName(
  label: TabLabel | undefined,
  fallback: string,
): string {
  return (label?.accessibleName ?? fallback).replace(/[\u2066-\u2069]/gu, '');
}

const DocumentTabs: React.FC<DocumentTabsProps> = ({
  adapter = appModelAdapter,
  onActivateDocument,
  onCloseDocument,
  onExternalConflict,
  onNewDocument,
  modalOpen = false,
}: DocumentTabsProps): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const orderedIds = useAppSelector((state) => state.documents.orderedIds);
  const documentsById = useAppSelector((state) => state.documents.byId);
  const orderedDocuments = useMemo(
    () =>
      orderedIds
        .map((documentId) => documentsById[documentId])
        .filter(
          (document): document is DocumentMetadata => document !== undefined,
        ),
    [documentsById, orderedIds],
  );
  const activeDocumentId = useAppSelector(
    (state) => state.documents.activeDocumentId,
  );
  const tabSetRevision = useAppSelector(
    (state) => state.documents.tabSetRevision,
  );
  const [contextDocumentId, setContextDocumentId] = useState<string | null>(
    null,
  );
  const [contextAnchor, setContextAnchor] = useState<PopupAnchor | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const labels = useMemo(
    () => tabLabelsFor(orderedDocuments),
    [orderedDocuments],
  );
  const contextDocument = orderedDocuments.find(
    (document) => document.documentId === contextDocumentId,
  );
  const contextIndex =
    contextDocument === undefined
      ? -1
      : orderedDocuments.findIndex(
          (document) => document.documentId === contextDocument.documentId,
        );

  const focusDocument = useCallback((documentId: string): void => {
    tabRefs.current.get(documentId)?.focus();
  }, []);

  /*
   * FR-FT-037's focus chain, steps two to four: the current active tab, then
   * the tab strip's New control, then the launcher's New control. The last
   * step is not decoration — closing the last document unmounts `EditorView`
   * and this whole strip with it, and `AppShell` renders `Launcher` in its
   * place, so by the time a close settles there may be no strip left to focus.
   * Both controls are found by attribute rather than by ref for the same
   * reason: the element that owns the ref may already be gone.
   */
  const focusFallback = useCallback((): void => {
    if (activeDocumentId !== null && tabRefs.current.has(activeDocumentId)) {
      focusDocument(activeDocumentId);
      return;
    }
    const stripNewControl = document.querySelector<HTMLButtonElement>(
      '[data-tab-new="true"]',
    );
    if (stripNewControl !== null) {
      stripNewControl.focus();
      return;
    }
    document
      .querySelector<HTMLButtonElement>('[data-launcher-new="true"]')
      ?.focus();
  }, [activeDocumentId, focusDocument]);

  const restoreMenuFocus = useCallback(
    (documentId: string): void => {
      if (tabRefs.current.has(documentId)) {
        focusDocument(documentId);
        return;
      }
      focusFallback();
    },
    [focusDocument, focusFallback],
  );

  /*
   * A deferred restoration outlives the menu that asked for it, so the pending
   * wait is held here rather than in `TabContextMenu` — the menu unmounts the
   * instant it closes, which would take its own listener with it and the
   * restoration would never happen. Cancelling on unmount, and before arming a
   * new one, is what keeps a `focus` handler from accumulating per invocation.
   */
  const cancelPendingFocusRestore = useRef<(() => void) | null>(null);
  useEffect(
    () => (): void => {
      cancelPendingFocusRestore.current?.();
      cancelPendingFocusRestore.current = null;
    },
    [],
  );

  const announce = useCallback((message: string): void => {
    setAnnouncement('');
    window.setTimeout((): void => setAnnouncement(message), 0);
    window.setTimeout((): void => setAnnouncement(''), 3000);
  }, []);

  const handleTabReorder = useCallback(
    async (documentId: string, targetIndex: number): Promise<void> => {
      const fromIndex = orderedDocuments.findIndex(
        (document) => document.documentId === documentId,
      );
      const document = orderedDocuments[fromIndex];
      if (
        document === undefined ||
        targetIndex < 0 ||
        targetIndex >= orderedDocuments.length ||
        targetIndex === fromIndex
      ) {
        return;
      }

      let revision = tabSetRevision;
      let index = fromIndex;
      const step = targetIndex > fromIndex ? 1 : -1;
      while (index !== targetIndex) {
        const next = index + step;
        const result = await adapter.reorderDocument?.(
          documentId,
          next,
          revision,
        );
        if (result?.error !== undefined) {
          reportClassifiedError(
            dispatch,
            result.error,
            'The tab could not be moved.',
            {
              intent: 'reorder-document',
              retry: { reorder: { documentId, targetIndex } },
            },
          );
          return;
        }
        if (result?.status !== 'reordered') return;
        revision = result.tabSetRevision ?? revision;
        index = next;
      }
      announce(
        t('editor.tab.moved', {
          filename: announcementName(labels.get(documentId), document.title),
          position: index + 1,
          count: orderedDocuments.length,
        }),
      );
    },
    [adapter, announce, dispatch, labels, orderedDocuments, tabSetRevision],
  );

  /*
   * T140. Two defects, one shape: a switch that fails has to end in a reported
   * refusal, never in a rejected promise, because every caller of
   * `activateDocument` below discards its result with `void` and a rejection
   * there reaches the user as a dead tab click and an unhandled rejection.
   *
   * The fallback branch had a second problem of its own. FR-FT-031 requires the
   * outgoing document's state to be flushed and awaited "before activating the
   * incoming document", and the shell's `onActivateDocument` does that — but
   * when no shell handler is supplied this component went straight to
   * `adapter.activateDocument` with no flush at all, silently dropping the
   * outgoing document's newest caret, selection, scroll and view state.
   *
   * The `catch` is the backstop for everything that is not the flush: the
   * adapter throws rather than refuses while editor-state recovery holds the
   * command surface, and that must still leave the outgoing tab where it is.
   * It reports the same classified refusal, because the user-visible outcome is
   * identical — the switch did not happen and re-issuing it is the remedy.
   */
  const runActivation = useCallback(
    async (documentId: string): Promise<unknown> => {
      try {
        if (onActivateDocument) {
          return await onActivateDocument(documentId, tabSetRevision);
        }
        const refusal = await flushOutgoingDocument(
          adapter.flushActiveSession,
          activeDocumentId === null || activeDocumentId === documentId
            ? undefined
            : activeDocumentId,
        );
        if (refusal !== undefined) return { error: refusal };
        return await adapter.activateDocument?.(documentId, tabSetRevision);
      } catch {
        return { error: outgoingFlushRefusal() };
      }
    },
    [activeDocumentId, adapter, onActivateDocument, tabSetRevision],
  );

  const activateDocument = useCallback(
    async (documentId: string): Promise<unknown> => {
      const result = (await runActivation(documentId)) as
        (DocumentTransitionResult & { conflict?: ConflictPreview }) | undefined;
      if (
        result !== undefined &&
        'error' in result &&
        result.error !== undefined
      ) {
        /*
         * T156. A refused activation is `conflict` — "The tab set changed; the
         * switch must be retried." — and Go sends `Retry` with it. The command
         * is well defined: re-read `tabSetRevision` and activate the same tab
         * again. `retry.documentId` names it explicitly rather than relying on
         * `error.documentId`, because a stale-tab-set refusal is about the set
         * and frequently names no document at all; without it the control would
         * be dropped for want of a target it does have.
         */
        reportClassifiedError(
          dispatch,
          result.error,
          'The document could not be activated.',
          { intent: 'activate-document', retry: { documentId } },
        );
      }
      if (result?.conflict !== undefined) {
        onExternalConflict?.(result.conflict);
      }
      return result;
    },
    [dispatch, onExternalConflict, runActivation],
  );

  const closeDocument = useCallback(
    async (
      documentId: string,
      expectedRevision: number,
      kind: ClosePlanKind = 'single',
      targetDocumentIds: string[] = [documentId],
    ): Promise<TabTransitionResult | undefined> => {
      /*
       * T164. Whoever owns the command owns the report.
       *
       * When the shell supplies `onCloseDocument` it reports its own refusals
       * through `reportClosePlanError`, and it is the only frame that can offer
       * a useful Retry, because it alone holds the original kind and targets.
       * Reporting here as well produced a real `×2` on the execute arm:
       * `completeClosePlan` reports the failure and then *returns* it, so this
       * saw the same error the shell had already announced, and the count
       * rendered over the Retry control — the exact defect T188 made
       * unrepeatable for activation.
       *
       * The prepare arm never showed it, because that path returns
       * `{status: 'noop'}` with no error, which is why this read as unreachable
       * rather than as a duplicate.
       *
       * The arm is kept rather than deleted: without `onCloseDocument` this
       * component drives `adapter.closeDocument` directly and is then the only
       * reporter there is.
       */
      if (onCloseDocument) {
        return await onCloseDocument(
          documentId,
          expectedRevision,
          kind,
          targetDocumentIds,
        );
      }
      const result = await adapter.closeDocument?.(
        documentId,
        expectedRevision,
      );
      if (result?.error !== undefined) {
        reportClassifiedError(
          dispatch,
          result.error,
          'The document could not be closed.',
        );
      }
      return result;
    },
    [adapter, dispatch, onCloseDocument],
  );

  /*
   * FR-FT-034 lists three affordances that close the *targeted* tab: the close
   * control, middle-click, and the tab-specific Close action. All three land
   * here rather than on `adapter.closeDocument`, because the shell installs
   * the dirty-close prompt on `onCloseDocument` — a middle-click that reached
   * the adapter directly would close an unsaved document without asking.
   */
  const closeTargetedTab = useCallback(
    (documentId: string): void => {
      void closeDocument(documentId, tabSetRevision, 'single', [
        documentId,
      ]).then((result): void => {
        if (
          result?.activeDocumentId !== undefined &&
          result.activeDocumentId !== ''
        ) {
          focusDocument(result.activeDocumentId);
        } else {
          focusFallback();
        }
      });
    },
    [closeDocument, focusDocument, focusFallback, tabSetRevision],
  );

  /*
   * T165. One move, one report, one announcement — kept together deliberately.
   *
   * FR-FT-034 requires a completed move to be announced, and the announcement
   * needs the disambiguated label and the strip's length, which only exist here.
   * Splitting the command from its announcement is what made a reorder Retry
   * impossible to add from App: the control would have moved the tab and said
   * nothing, satisfying the remediation contract by breaking FR-FT-034.
   *
   * The refusal now carries `reorder-document`, so the same function serves the
   * first attempt and the retry, and the announcement cannot be forgotten on one
   * path and not the other.
   */
  const moveTab = useCallback(
    async (
      document: DocumentMetadata,
      targetIndex: number,
      expectedRevision: number,
    ): Promise<TabTransitionResult | undefined> => {
      const result = await adapter.reorderDocument?.(
        document.documentId,
        targetIndex,
        expectedRevision,
      );
      if (result?.error !== undefined) {
        reportClassifiedError(
          dispatch,
          result.error,
          'The tab could not be moved.',
          {
            intent: 'reorder-document',
            retry: {
              reorder: { documentId: document.documentId, targetIndex },
            },
          },
        );
      } else if (result?.status === 'reordered') {
        announce(
          t('editor.tab.moved', {
            filename: announcementName(
              labels.get(document.documentId),
              document.title,
            ),
            position: targetIndex + 1,
            count: orderedDocuments.length,
          }),
        );
      }
      return result;
    },
    [adapter, announce, dispatch, labels, orderedDocuments.length],
  );

  /*
   * Fill App's remediation slot while this strip is mounted.
   *
   * The revision arrives from App, read fresh from the backend, rather than
   * being taken from the `tabSetRevision` selector above: the store is a
   * projection, and the refusal being remediated *is* "the tab set changed", so
   * the patch carrying the change may not have arrived. The entry arms in App
   * read it the same way and for the same reason.
   */
  const remediationSlotRef = useContext(TabRemediationContext);
  useEffect(() => {
    if (remediationSlotRef === null) return undefined;
    remediationSlotRef.current = async (remediation, freshTabSetRevision) => {
      const move = remediation.reorder;
      if (remediation.intent !== 'reorder-document' || move === undefined) {
        return false;
      }
      const document = documentsById[move.documentId];
      if (document === undefined) return false;
      const result = await moveTab(
        document,
        move.targetIndex,
        freshTabSetRevision,
      );
      // A refused retry has already reported itself through `moveTab`, offering
      // the control again against the newer revision. Saying it was handled
      // would dismiss the toast that carries it.
      return result?.error === undefined;
    };
    return () => {
      remediationSlotRef.current = undefined;
    };
  }, [documentsById, moveTab, remediationSlotRef]);

  const handleTabAction = useCallback(
    async (
      action: TabContextAction,
      document: DocumentMetadata,
      targetIndex?: number,
    ): Promise<unknown> => {
      if (action === 'move-tab-left' || action === 'move-tab-right') {
        return await moveTab(document, targetIndex ?? 0, tabSetRevision);
      }
      if (action === 'copy-path') {
        const result = await adapter.copyPath?.(document.documentId);
        if (result?.error !== undefined) {
          // A clipboard refusal is `system-command-failure`, which the contract
          // remediates with Retry — and retrying means running this same command
          // again, so the intent is honourable rather than decorative.
          reportClassifiedError(
            dispatch,
            result.error,
            'The path could not be copied.',
            { intent: 'copy-path' },
          );
        } else if (result?.status === 'copied') {
          announce(
            t('editor.tab.copiedPath', {
              filename: announcementName(
                labels.get(document.documentId),
                document.title,
              ),
            }),
          );
        }
        return result;
      }
      if (action === 'reveal-in-file-manager') {
        const result = await adapter.revealInFileManager?.(document.documentId);
        if (result?.error !== undefined) {
          // FR-FT-037 pairs a Reveal failure with Copy path *and* a Retry that
          // re-runs Reveal. `intent: 'reveal'` is what earns the second control:
          // both are real commands here, because the document is known.
          reportClassifiedError(
            dispatch,
            result.error,
            'The file manager could not reveal the document.',
            { intent: 'reveal' },
          );
        }
        return result;
      }
      if (action === 'close-tab') {
        return closeDocument(document.documentId, tabSetRevision, 'single', [
          document.documentId,
        ]);
      }
      const targets =
        action === 'close-right'
          ? orderedDocuments.slice(
              orderedDocuments.findIndex(
                (candidate) => candidate.documentId === document.documentId,
              ) + 1,
            )
          : orderedDocuments.filter(
              (candidate) => candidate.documentId !== document.documentId,
            );
      return closeDocument(
        document.documentId,
        tabSetRevision,
        action === 'close-right' ? 'right' : 'others',
        targets.map((target) => target.documentId),
      );
    },
    [
      adapter,
      announce,
      closeDocument,
      dispatch,
      labels,
      moveTab,
      orderedDocuments,
      tabSetRevision,
    ],
  );

  /*
   * The tab strip's own accelerator listener. It answers for four registry
   * ids, not two: `next-tab` and `previous-tab` cycle the selection, and
   * `move-tab-left`/`move-tab-right` reorder the active tab. FR-FT-034 binds
   * the latter pair to `Ctrl/Cmd+Shift+PageUp/PageDown`, and
   * `shortcutForKeyEvent` has always resolved those bindings — until T129 the
   * ids were simply in nobody's list, so the keys resolved to an action that
   * nothing then dispatched. `useShellShortcuts` cannot cover them either: it
   * is installed once over `actionsForSurface('file-menu')`, and the only
   * surface these two declare is `tab-context`.
   *
   * A Move goes through `handleTabAction`, the same path the context menu
   * uses, so the command still carries the tab-set revision FR-FT-033
   * requires and still produces the `editor.tab.moved` announcement.
   */
  useEffect((): (() => void) => {
    const navigate = (event: KeyboardEvent): void => {
      if (modalOpen) return;
      const binding = shortcutForKeyEvent(event, currentPlatform());
      if (binding === undefined) return;
      /*
       * Two surfaces, because the four ids this listener answers for do not
       * share one. `next-tab`/`previous-tab` declare `shortcuts`;
       * `move-tab-left`/`move-tab-right` declare only `tab-context`, which is
       * how their bindings came to resolve to an action nobody dispatched.
       * The registry is left alone: adding `shortcuts` to those two entries
       * would also list them in the keyboard-shortcuts dialog, which is a
       * user-visible change FR-FT-034 does not ask for.
       */
      const action = [
        ...actionsForSurface('shortcuts'),
        ...actionsForSurface('tab-context'),
      ].find(
        (candidate) =>
          candidate.shortcut === binding ||
          candidate.shortcutAliases?.includes(binding),
      );
      if (action === undefined) return;
      const moving =
        action.id === 'move-tab-left' || action.id === 'move-tab-right';
      if (action.id !== 'next-tab' && action.id !== 'previous-tab' && !moving) {
        return;
      }
      if (orderedDocuments.length < 2 || activeDocumentId === null) return;
      const current = orderedDocuments.findIndex(
        (document) => document.documentId === activeDocumentId,
      );
      if (current < 0) return;
      event.preventDefault();
      if (moving) {
        const active = orderedDocuments[current];
        if (active === undefined) return;
        const targetIndex = current + (action.id === 'move-tab-left' ? -1 : 1);
        /*
         * FR-FT-034: "Moving past an edge MUST succeed as a no-op without
         * incrementing the tab-set revision." Clamping the index instead —
         * `Math.max(0, current - 1)` — would issue a reorder to the position
         * the tab already occupies, and the backend would answer it with a
         * new tab-set revision. Succeeding here means consuming the key and
         * issuing nothing: no command, no revision, no announcement, and no
         * error either, because this is not a refusal.
         */
        if (targetIndex < 0 || targetIndex >= orderedDocuments.length) return;
        void handleTabAction(action.id, active, targetIndex);
        return;
      }
      const offset = action.id === 'next-tab' ? 1 : -1;
      const target =
        orderedDocuments[
          (current + offset + orderedDocuments.length) % orderedDocuments.length
        ];
      if (target !== undefined) void activateDocument(target.documentId);
    };
    globalThis.document.addEventListener('keydown', navigate);
    return (): void =>
      globalThis.document.removeEventListener('keydown', navigate);
  }, [
    activateDocument,
    activeDocumentId,
    handleTabAction,
    modalOpen,
    orderedDocuments,
  ]);

  const contextAdapter: TabContextAdapter = adapter;

  return (
    <>
      <TabBar
        ariaLabel={t('editor.tabs')}
        onActivate={(documentId): void => {
          void activateDocument(documentId);
        }}
        onAdd={(): void => {
          if (onNewDocument) {
            void onNewDocument(tabSetRevision);
            return;
          }
          void adapter.newDocument?.(tabSetRevision).then((result) => {
            reportClassifiedError(dispatch, result?.error, t('editor.tab.new'));
          });
        }}
        onClose={closeTargetedTab}
        onContextMenu={(documentId, anchor): void => {
          setContextDocumentId(documentId);
          setContextAnchor(anchor);
        }}
        onReorder={(documentId, targetIndex): void => {
          void handleTabReorder(documentId, targetIndex);
        }}
        onTabRef={(documentId, element): void => {
          if (element === null) tabRefs.current.delete(documentId);
          else tabRefs.current.set(documentId, element);
        }}
        newTabLabel={t('editor.tab.new')}
        tabs={orderedDocuments.map((document) => {
          const label = labels.get(document.documentId) as TabLabel;
          return {
            active: document.documentId === activeDocumentId,
            closeLabel: t('editor.tab.close', { title: label.accessibleName }),
            conflictBlocked: document.conflictBlocked,
            conflictLabel: t('conflict.blocked'),
            controls: EDITOR_TABPANEL_ID,
            dirty: document.dirty,
            id: document.documentId,
            label: label.accessibleName,
            labelParts: truncatedTabLabelParts(label, 42),
            modifiedLabel: t('editor.tab.modified'),
            readOnly:
              document.capability !== undefined &&
              document.capability !== 'writable',
            tabId: tabElementId(document.documentId),
            title: document.path || undefined,
            writeInFlight: document.writeInFlight,
          };
        })}
      />
      {contextDocument !== undefined && contextIndex >= 0 ? (
        <TabContextMenu
          adapter={contextAdapter}
          anchor={contextAnchor ?? { point: { x: 0, y: 0 } }}
          document={contextDocument}
          index={contextIndex}
          onAction={handleTabAction}
          onClose={(options?: TabContextCloseOptions): void => {
            setContextDocumentId(null);
            setContextAnchor(null);
            const documentId = contextDocument.documentId;
            cancelPendingFocusRestore.current?.();
            cancelPendingFocusRestore.current = null;
            if (options?.deferFocusRestore !== true) {
              restoreMenuFocus(documentId);
              return;
            }
            cancelPendingFocusRestore.current =
              whenApplicationRegainsForegroundFocus((): void => {
                cancelPendingFocusRestore.current = null;
                restoreMenuFocus(documentId);
              });
          }}
          orderedDocuments={orderedDocuments}
          tabSetRevision={tabSetRevision}
        />
      ) : null}
      <LiveRegion message={announcement} />
    </>
  );
};

export default DocumentTabs;
