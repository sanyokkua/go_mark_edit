import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  appModelAdapter,
  documentConflictAdapter,
  type AppModelAdapter,
  type DocumentConflictAdapter,
} from '../../logic/adapter';
import type {
  ClosePlanKind,
  ConflictPreview,
  ConflictResult,
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
import ExternalChangePrompt, {
  type ExternalChangeDecision,
} from './ExternalChangePrompt';
import TabContextMenu, {
  type TabContextAction,
  type TabContextAdapter,
  type TabContextCloseOptions,
} from './TabContextMenu';
import { EDITOR_TABPANEL_ID, tabElementId } from './editorTabPanel';
import {
  onApplicationForeground,
  whenApplicationRegainsForegroundFocus,
} from './foregroundFocus';
import { flushOutgoingDocument, outgoingFlushRefusal } from './outgoingFlush';
import {
  tabLabelsFor,
  truncatedTabLabelParts,
  type TabLabel,
} from './tabLabel';
import styles from './DocumentTabs.module.css';

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
  conflictAdapter?: DocumentConflictAdapter;
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

/*
 * T130, FR-FT-036. How far the pointer must travel before a press becomes a
 * drag. Without a threshold every click on a tab is a zero-length drag: the
 * press would immediately paint an insertion indicator, and releasing would run
 * the drop path instead of the activation the user asked for. Four pixels is
 * the usual slop for a hand that is trying to hold still, and it is well below
 * the distance that reaches a neighbouring tab.
 */
const TAB_DRAG_THRESHOLD_PX = 4;

/*
 * The pointer sits *between* tabs, so the drag's position is a slot in
 * `0..orderedDocuments.length`, not a tab index: slot 0 is before the first
 * tab, slot n after the last. A slot becomes the index the dragged tab would
 * occupy only after accounting for the gap the tab itself vacates \u2014 dropping at
 * slot 3 while dragging the tab at index 1 lands on index 2, because index 1
 * closes up behind it.
 */
function targetIndexForSlot(slot: number, fromIndex: number): number {
  return slot > fromIndex ? slot - 1 : slot;
}

/*
 * "Dragging a tab MUST show the insertion position" — this is that showing. A
 * real flex child rather than an outline on a neighbouring tab, so it occupies
 * the gap the tab would land in, and `aria-hidden` because it is a picture of
 * where the pointer is. It carries no `pointer-events: none`: the drop position
 * is measured from the tab boxes and the pointer's own coordinate, never from a
 * hit test, so letting the bar be hit-testable costs nothing and is what lets
 * `expectPainted` see that it is actually painted rather than clipped away.
 */
function insertionIndicator(slot: number): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={styles.tabInsertionIndicator}
      data-tab-insertion-slot={slot}
      key={`tab-insertion-${slot}`}
    />
  );
}

const DocumentTabs: React.FC<DocumentTabsProps> = ({
  adapter = appModelAdapter,
  conflictAdapter = documentConflictAdapter,
  onActivateDocument,
  onCloseDocument,
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
  const [announcement, setAnnouncement] = useState('');
  const [conflictPreview, setConflictPreview] =
    useState<ConflictPreview | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const labels = useMemo(
    () => tabLabelsFor(orderedDocuments),
    [orderedDocuments],
  );
  const emptyParityRoute =
    orderedDocuments.length === 0 &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case');
  const contextDocument = orderedDocuments.find(
    (document) => document.documentId === contextDocumentId,
  );
  const contextIndex =
    contextDocument === undefined
      ? -1
      : orderedDocuments.findIndex(
          (document) => document.documentId === contextDocument.documentId,
        );

  const conflictDocument =
    conflictPreview === null
      ? undefined
      : documentsById[conflictPreview.documentId];
  const conflictValid =
    conflictDocument?.contentRevision === undefined ||
    conflictDocument.contentRevision === conflictPreview?.contentRevision;

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

  /*
   * The strip becomes a scroll container only once its tabs no longer fit.
   * Chromium composites a scrollable area and drops LCD subpixel antialiasing
   * inside it, so declaring `overflow-x: auto` unconditionally re-rendered every
   * glyph in the row against the binding. A strip with nothing to scroll has no
   * reason to be promoted, and this also keeps its computed `overflow` matching
   * the binding at the widths the targeted comparator comes in at.
   *
   * Measured rather than counted: how many tabs fit depends on the window width
   * and on the filenames, so nothing here may assume a number of them.
   */
  useEffect((): (() => void) | undefined => {
    const strip = stripRef.current;
    if (strip === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const measure = (): void => {
      setTabsOverflowing(strip.scrollWidth > strip.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return (): void => observer.disconnect();
  }, [orderedDocuments]);

  const announce = useCallback((message: string): void => {
    setAnnouncement('');
    window.setTimeout((): void => setAnnouncement(message), 0);
    window.setTimeout((): void => setAnnouncement(''), 3000);
  }, []);

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
        setConflictPreview(result.conflict);
      }
      return result;
    },
    [dispatch, runActivation],
  );

  /*
   * FR-FT-020's second occasion: "Tab activation and window focus or resume
   * MUST also run stable foreground version checks for path-backed documents,
   * including read-only documents."
   *
   * Tab activation was already covered in Go — every `ActivateDocument` ends in
   * `attachForegroundConflict` (`internal/appmodel/tab_session.go`). Focus and
   * resume were covered nowhere: Wails v2's `options.App` has no focus or
   * resume hook, so the webview is the only thing that can observe them, and
   * the bound `CheckExternalChanges` had no application caller at all.
   *
   * Every path-backed document is checked, not just the active one, because
   * that is what the clause says and because the value of checking is exactly
   * for the tabs nobody is looking at: the backend records `conflictBlocked`
   * per document, which is what paints the strip's blocked marker and what
   * refuses a later write. A document with no path has no disk version to
   * compare, so it is skipped rather than refused. Read-only documents are not
   * skipped — the requirement names them.
   *
   * The prompt is opened only for the active document. `conflictPreview` is a
   * single slot and FR-FT-021 describes one modal; a background tab's conflict
   * is carried by its marker until the user activates it, and activation runs
   * the same check again. A refusal is not toasted either: FR-FT-020 gives the
   * foreground check no user-facing failure surface — an unstable read "MUST
   * write nothing and retry only after a fresh foreground check" — and the
   * write path re-runs the check and reports there, where the user asked for
   * something.
   *
   * `foregroundCheckRunning` is the coalescer: one resume can raise `focus` and
   * `visibilitychange` together, and a second sweep over the same documents
   * while the first is still walking them would double the filesystem work for
   * no new information.
   */
  const foregroundCheckRunning = useRef(false);
  const runForegroundChecks = useCallback((): void => {
    if (foregroundCheckRunning.current) return;
    foregroundCheckRunning.current = true;
    void (async (): Promise<void> => {
      try {
        /*
         * The adapter throws rather than refuses while editor-state recovery
         * holds the command surface (`assertCommandsAvailable`), and a focus
         * event during recovery would otherwise leave an unhandled rejection.
         * Abandoning the sweep is the right answer and not a swallow: a check
         * that could not run leaves backend state untouched, and FR-FT-020
         * already says the remedy for one is another foreground check — the
         * next focus, or the one the write path runs before it commits.
         */
        for (const document of orderedDocuments) {
          if (document.path === '') continue;
          const result = await conflictAdapter.checkExternalChanges(
            document.documentId,
          );
          if (
            result.status === 'detected' &&
            result.preview !== undefined &&
            document.documentId === activeDocumentId
          ) {
            setConflictPreview(result.preview);
          }
        }
      } catch {
        // Deliberately terminal, for the reason stated above.
      } finally {
        foregroundCheckRunning.current = false;
      }
    })();
  }, [activeDocumentId, conflictAdapter, orderedDocuments]);
  useEffect(
    (): (() => void) => onApplicationForeground(runForegroundChecks),
    [runForegroundChecks],
  );

  const handleConflictDecision = useCallback(
    async (decision: ExternalChangeDecision): Promise<void> => {
      const preview = conflictPreview;
      if (preview === null || conflictBusy) return;
      setConflictBusy(true);
      let result: ConflictResult;
      switch (decision) {
        case 'reload':
          result = await conflictAdapter.reloadFromDisk(
            preview.documentId,
            preview.contentRevision,
            preview.detectedDiskVersion,
          );
          break;
        case 'keep-mine':
          result = await conflictAdapter.authorizeKeepMine(
            preview.documentId,
            preview.contentRevision,
            preview.path ?? '',
            preview.detectedDiskVersion,
          );
          break;
        case 'skip':
          result = await conflictAdapter.skipConflict(
            preview.documentId,
            preview.contentRevision,
            preview.detectedDiskVersion,
          );
          break;
        case 'cancel':
          result = await conflictAdapter.cancelConflict(
            preview.documentId,
            preview.contentRevision,
            preview.detectedDiskVersion,
          );
          break;
      }
      setConflictBusy(false);
      if (result.error !== undefined) {
        reportClassifiedError(
          dispatch,
          result.error,
          'The external-change decision could not be completed.',
        );
      }
      if (result.preview !== undefined) {
        setConflictPreview(result.preview);
      } else if (result.error === undefined) {
        setConflictPreview(null);
      }
    },
    [conflictAdapter, conflictBusy, conflictPreview, dispatch],
  );

  const closeDocument = useCallback(
    async (
      documentId: string,
      expectedRevision: number,
      kind: ClosePlanKind = 'single',
      targetDocumentIds: string[] = [documentId],
    ): Promise<TabTransitionResult | undefined> => {
      const result = onCloseDocument
        ? await onCloseDocument(
            documentId,
            expectedRevision,
            kind,
            targetDocumentIds,
          )
        : await adapter.closeDocument?.(documentId, expectedRevision);
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

  const handleTabAction = useCallback(
    async (
      action: TabContextAction,
      document: DocumentMetadata,
      targetIndex?: number,
    ): Promise<unknown> => {
      if (action === 'move-tab-left' || action === 'move-tab-right') {
        const result = await adapter.reorderDocument?.(
          document.documentId,
          targetIndex ?? 0,
          tabSetRevision,
        );
        if (result?.error !== undefined) {
          reportClassifiedError(
            dispatch,
            result.error,
            'The tab could not be moved.',
          );
        } else if (result?.status === 'reordered') {
          const position = (targetIndex ?? 0) + 1;
          announce(
            t('editor.tab.moved', {
              filename: announcementName(
                labels.get(document.documentId),
                document.title,
              ),
              position,
              count: orderedDocuments.length,
            }),
          );
        }
        return result;
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
      orderedDocuments,
      tabSetRevision,
    ],
  );

  /*
   * T130, FR-FT-036 — the pointer drag. Three clauses are built here (grab,
   * insertion position, drop) plus the requirement's two guards (Escape
   * cancels, a same-position drop issues nothing). The reduced-opacity dragged
   * tab and the edge auto-scroll are deferred to T177.
   *
   * Pointer events rather than the HTML5 drag-and-drop API. There was no drag
   * code here to follow, so this was a free choice, and DnD loses it on every
   * axis that matters: its Escape handling is the browser's and cannot be
   * observed reliably, it imposes a drag image that would fight the custom
   * ghost T177 owns, and `dataTransfer` is awkward to drive from Playwright.
   *
   * Accessibility: deliberately no `aria-grabbed`/`aria-dropeffect`. Both were
   * deprecated in ARIA 1.1 and removed in 1.2, no current screen reader acts on
   * them, and adding them would put a dead attribute on a `role="tab"` whose
   * roving `tabIndex` and Home/End/Arrow handling already work. The accessible
   * equivalent of this drag is FR-FT-034's Move tab left/right — same command,
   * same `editor.tab.moved` polite announcement — and a completed drag
   * announces through exactly that live region below. The insertion indicator
   * is `aria-hidden`, because it is a picture of a pointer position that a
   * keyboard user reaches by a different route.
   */
  const pendingGrab = useRef<{
    documentId: string;
    fromIndex: number;
    startX: number;
  } | null>(null);
  const activeDrag = useRef<{ documentId: string; fromIndex: number } | null>(
    null,
  );
  const dragTeardown = useRef<(() => void) | null>(null);
  const suppressActivationClick = useRef(false);
  const [insertionSlot, setInsertionSlot] = useState<number | null>(null);

  const endDrag = useCallback((): void => {
    dragTeardown.current?.();
    dragTeardown.current = null;
    pendingGrab.current = null;
    activeDrag.current = null;
    setInsertionSlot(null);
  }, []);
  useEffect((): (() => void) => endDrag, [endDrag]);

  /*
   * The strip is measured, never counted. Tab widths differ by filename and by
   * theme, so the slot is whichever tab box the pointer has passed the middle
   * of. `[data-tab-item]` is queried rather than held in a ref map because DOM
   * order is the order being reasoned about, and the indicator this returns a
   * position for is itself a child of the same strip.
   */
  const insertionSlotAt = useCallback((clientX: number): number => {
    const strip = stripRef.current;
    if (strip === null) return 0;
    const items = [...strip.querySelectorAll<HTMLElement>('[data-tab-item]')];
    for (const [index, item] of items.entries()) {
      const rect = item.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return index;
    }
    return items.length;
  }, []);

  /*
   * FR-FT-033 requires every reorder to carry the tab-set revision it was
   * issued against, and `ReorderDocument` accepts one-position moves only
   * (`internal/appmodel/tab_reorder.go:25` refuses anything further as
   * `unsupported-input`). A drag across three tabs is therefore three commands,
   * each carrying the revision the previous one returned — not the stale
   * revision this render closed over, which the second command would be refused
   * against. Nothing is projected locally: the order the strip shows is
   * whatever the backend's `state:patch` says it is, so a refusal part-way
   * leaves the strip on the last confirmed order rather than on a guess.
   */
  const dropDraggedTab = useCallback(
    async (documentId: string, fromIndex: number, slot: number) => {
      const finalIndex = targetIndexForSlot(slot, fromIndex);
      /*
       * FR-FT-036: "issue no reorder for a same-position drop". Issuing one
       * anyway would *look* harmless — the backend answers `noop` and the order
       * does not change — but `tabTransitionSuccess` still reports the current
       * tab-set revision and every in-flight command holding the older one is
       * then racing a set it no longer describes. Not issuing is the clause.
       */
      if (finalIndex === fromIndex) return;
      const document = orderedDocuments[fromIndex];
      if (document === undefined) return;
      let revision = tabSetRevision;
      let index = fromIndex;
      const step = finalIndex > fromIndex ? 1 : -1;
      while (index !== finalIndex) {
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

  const beginGrab = useCallback(
    (documentId: string, fromIndex: number, startX: number): void => {
      endDrag();
      suppressActivationClick.current = false;
      pendingGrab.current = { documentId, fromIndex, startX };

      const move = (event: MouseEvent): void => {
        const pending = pendingGrab.current;
        if (
          activeDrag.current === null &&
          pending !== null &&
          Math.abs(event.clientX - pending.startX) >= TAB_DRAG_THRESHOLD_PX
        ) {
          activeDrag.current = {
            documentId: pending.documentId,
            fromIndex: pending.fromIndex,
          };
          suppressActivationClick.current = true;
        }
        if (activeDrag.current === null) return;
        event.preventDefault();
        setInsertionSlot(insertionSlotAt(event.clientX));
      };
      const up = (event: MouseEvent): void => {
        const drag = activeDrag.current;
        endDrag();
        if (drag === null) return;
        void dropDraggedTab(
          drag.documentId,
          drag.fromIndex,
          insertionSlotAt(event.clientX),
        );
      };
      /*
       * FR-FT-036's Escape clause. Capture phase, so a drag is abandoned before
       * anything else in the shell reads the key, and `endDrag` is the whole
       * behaviour: no command is issued, so there is no order change to undo
       * and no revision to bump.
       */
      const cancelKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        if (activeDrag.current === null && pendingGrab.current === null) return;
        event.preventDefault();
        endDrag();
      };
      const cancelPointer = (): void => endDrag();

      const target = globalThis.document;
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', cancelPointer);
      target.addEventListener('keydown', cancelKey, true);
      dragTeardown.current = (): void => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', cancelPointer);
        target.removeEventListener('keydown', cancelKey, true);
      };
    },
    [dropDraggedTab, endDrag, insertionSlotAt],
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
      if (modalOpen || conflictPreview !== null) return;
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
    conflictPreview,
    handleTabAction,
    modalOpen,
    orderedDocuments,
  ]);

  const contextAdapter: TabContextAdapter = adapter;

  return (
    <>
      <div
        ref={stripRef}
        aria-label={t('editor.tabs')}
        data-tabs-overflowing={tabsOverflowing ? 'true' : undefined}
        className={`${styles.tabStrip} ${emptyParityRoute ? styles.emptyParityTabStrip : ''}`}
        role="tablist"
        onKeyDown={(event): void => {
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const target =
              event.key === 'Home'
                ? orderedDocuments[0]
                : orderedDocuments.at(-1);
            if (target !== undefined) focusDocument(target.documentId);
            return;
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          const current = orderedDocuments.findIndex(
            (document) => document.documentId === activeDocumentId,
          );
          if (current < 0) return;
          event.preventDefault();
          const next =
            event.key === 'ArrowLeft'
              ? Math.max(0, current - 1)
              : Math.min(orderedDocuments.length - 1, current + 1);
          const target = orderedDocuments[next];
          if (target === undefined) return;
          /*
           * Focus moves with the arrow, then selection follows it — the
           * WAI-ARIA tabs pattern. Activating without moving focus left the
           * caret on a tab that the roving `tabIndex` had just set to -1 while
           * the newly selected tab became the only tab stop, so the next Tab
           * press escaped from somewhere the user could not see. Focus is a
           * pure UI concern and moves immediately; activation is a command the
           * backend may still refuse, and a focused non-selected tab is a
           * legitimate resting state if it does.
           */
          focusDocument(target.documentId);
          void activateDocument(target.documentId);
        }}
      >
        <>
          {orderedDocuments.flatMap((document, index) => {
            const label = labels.get(document.documentId) as TabLabel;
            const visualLabel = truncatedTabLabelParts(label, 42);
            const active = document.documentId === activeDocumentId;
            const item =
              (
                /*
                 * FR-FT-047 asks for correct roles, and `role="tab"` is only
                 * correct when a `tablist` owns it. This wrapper pairs the tab
                 * with its close control as one flex item, so it cannot be
                 * removed without moving the strip's pixels; `presentation`
                 * makes it transparent to the accessibility tree instead, which
                 * is what restores the ownership the markup already claimed.
                 */
                <div
                  className={styles.tabItem}
                  data-tab-item=""
                  key={document.documentId}
                  role="presentation"
                >
                  <button
                    aria-controls={EDITOR_TABPANEL_ID}
                    aria-selected={active}
                    aria-label={`${label.accessibleName}${document.conflictBlocked ? ` · ${t('conflict.blocked')}` : ''}`}
                    className={styles.tab}
                    data-document-id={document.documentId}
                    id={tabElementId(document.documentId)}
                    ref={(element): void => {
                      if (element === null)
                        tabRefs.current.delete(document.documentId);
                      else tabRefs.current.set(document.documentId, element);
                    }}
                    role="tab"
                    tabIndex={active ? 0 : -1}
                    title={document.path || undefined}
                    type="button"
                    onAuxClick={(event): void => {
                      if (event.button !== 1) return;
                      event.preventDefault();
                      closeTargetedTab(document.documentId);
                    }}
                    onClick={(): void => {
                      /*
                       * A completed drag ends in a `click` on the tab that was
                       * dragged, because the pointer went down and up on it.
                       * Activating there would switch documents every time the
                       * user reordered one. The flag is set only once the grab
                       * has passed the threshold, so an ordinary click — press,
                       * no movement, release — still activates.
                       */
                      if (suppressActivationClick.current) {
                        suppressActivationClick.current = false;
                        return;
                      }
                      void activateDocument(document.documentId);
                    }}
                    onContextMenu={(event): void => {
                      event.preventDefault();
                      setContextDocumentId(document.documentId);
                    }}
                    onPointerDown={(event): void => {
                      if (event.button !== 0) return;
                      beginGrab(document.documentId, index, event.clientX);
                    }}
                  >
                    <span
                      aria-hidden={document.dirty ? undefined : true}
                      aria-label={
                        document.dirty ? t('editor.tab.modified') : undefined
                      }
                      className={`${styles.modifiedDot} ${document.writeInFlight ? styles.modifiedDotMuted : ''}`}
                      data-write-in-flight={document.writeInFlight || undefined}
                    />
                    {document.conflictBlocked ? (
                      <span
                        aria-label={t('conflict.blocked')}
                        className={styles.modifiedDot}
                        data-conflict-blocked
                      >
                        {t('conflict.blocked')}
                      </span>
                    ) : null}
                    <span aria-hidden="true" className={styles.tabLabel}>
                      {visualLabel.suffix === '' ? (
                        visualLabel.basename
                      ) : (
                        <>
                          <span
                            className={styles.tabLabelBasename}
                            data-tab-label-basename
                          >
                            {visualLabel.basename}
                          </span>
                          <span
                            className={styles.tabLabelSuffix}
                            data-tab-label-suffix
                          >
                            {visualLabel.suffix}
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                  <button
                    aria-label={t('editor.tab.close', {
                      title: label.accessibleName,
                    })}
                    className={styles.tabClose}
                    type="button"
                    onClick={(): void => {
                      closeTargetedTab(document.documentId);
                    }}
                  >
                    <span aria-hidden="true" className={styles.tabCloseGlyph}>
                      ×
                    </span>
                  </button>
                </div>
              );
            return insertionSlot === index
              ? [insertionIndicator(index), item]
              : [item];
          })}
          {insertionSlot === orderedDocuments.length
            ? insertionIndicator(orderedDocuments.length)
            : null}
          <button
            aria-label={t('editor.tab.new')}
            className={styles.tabAdd}
            data-tab-new="true"
            type="button"
            /*
             * The two branches are mutually exclusive, so each reports its own
             * refusal and no path raises two toasts for one click. When the
             * shell supplies `onNewDocument` it is the single funnel shared
             * with the File menu and reports there; the adapter fallback is
             * only reached when it does not, and reports here. Until now this
             * handler discarded the result outright, so a `capacity-limit`
             * refusal at 40 documents reached the user as silence.
             */
            onClick={(): void => {
              if (onNewDocument) {
                void onNewDocument(tabSetRevision);
                return;
              }
              void adapter.newDocument?.(tabSetRevision).then((result) => {
                reportClassifiedError(
                  dispatch,
                  result.error,
                  t('editor.tab.new'),
                );
              });
            }}
          >
            +
          </button>
        </>
      </div>
      {contextDocument !== undefined && contextIndex >= 0 ? (
        <TabContextMenu
          adapter={contextAdapter}
          document={contextDocument}
          index={contextIndex}
          onAction={handleTabAction}
          onClose={(options?: TabContextCloseOptions): void => {
            setContextDocumentId(null);
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
      <ExternalChangePrompt
        onDecision={handleConflictDecision}
        open={conflictPreview !== null && !conflictBusy}
        preview={conflictPreview ?? undefined}
        valid={conflictValid}
      />
    </>
  );
};

export default DocumentTabs;
