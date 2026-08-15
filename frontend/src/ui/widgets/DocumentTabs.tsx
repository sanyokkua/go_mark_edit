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
} from './TabContextMenu';
import { tabLabelsFor, truncateTabLabel, type TabLabel } from './tabLabel';
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

  const focusFallback = useCallback((): void => {
    if (activeDocumentId !== null && tabRefs.current.has(activeDocumentId)) {
      focusDocument(activeDocumentId);
      return;
    }
    document.querySelector<HTMLButtonElement>('[data-tab-new="true"]')?.focus();
  }, [activeDocumentId, focusDocument]);

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

  const activateDocument = useCallback(
    async (documentId: string): Promise<unknown> => {
      const result = onActivateDocument
        ? await onActivateDocument(documentId, tabSetRevision)
        : await adapter.activateDocument?.(documentId, tabSetRevision);
      if (
        result !== undefined &&
        'error' in result &&
        result.error !== undefined
      ) {
        reportClassifiedError(
          dispatch,
          result.error,
          'The document could not be activated.',
        );
      }
      if (result?.conflict !== undefined) {
        setConflictPreview(result.conflict);
      }
      return result;
    },
    [adapter, dispatch, onActivateDocument, tabSetRevision],
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

  useEffect((): (() => void) => {
    const navigate = (event: KeyboardEvent): void => {
      if (modalOpen || conflictPreview !== null) return;
      const binding = shortcutForKeyEvent(event, currentPlatform());
      if (binding === undefined) return;
      const action = actionsForSurface('shortcuts').find(
        (candidate) =>
          candidate.shortcut === binding ||
          candidate.shortcutAliases?.includes(binding),
      );
      if (action?.id !== 'next-tab' && action?.id !== 'previous-tab') return;
      if (orderedDocuments.length < 2 || activeDocumentId === null) return;
      const current = orderedDocuments.findIndex(
        (document) => document.documentId === activeDocumentId,
      );
      if (current < 0) return;
      event.preventDefault();
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
    modalOpen,
    orderedDocuments,
  ]);

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
          reportClassifiedError(
            dispatch,
            result.error,
            'The path could not be copied.',
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
          reportClassifiedError(
            dispatch,
            result.error,
            'The file manager could not reveal the document.',
            true,
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
          {orderedDocuments.map((document) => {
            const label = labels.get(document.documentId) as TabLabel;
            const active = document.documentId === activeDocumentId;
            return (
              <div className={styles.tabItem} key={document.documentId}>
                <button
                  aria-selected={active}
                  aria-label={`${label.accessibleName}${document.conflictBlocked ? ` · ${t('conflict.blocked')}` : ''}`}
                  className={styles.tab}
                  data-document-id={document.documentId}
                  ref={(element): void => {
                    if (element === null)
                      tabRefs.current.delete(document.documentId);
                    else tabRefs.current.set(document.documentId, element);
                  }}
                  role="tab"
                  tabIndex={active ? 0 : -1}
                  title={document.path || undefined}
                  type="button"
                  onClick={(): void => {
                    void activateDocument(document.documentId);
                  }}
                  onContextMenu={(event): void => {
                    event.preventDefault();
                    setContextDocumentId(document.documentId);
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
                    {truncateTabLabel(label, 42)}
                  </span>
                </button>
                <button
                  aria-label={t('editor.tab.close', {
                    title: label.accessibleName,
                  })}
                  className={styles.tabClose}
                  type="button"
                  onClick={(): void => {
                    void closeDocument(
                      document.documentId,
                      tabSetRevision,
                    ).then((result): void => {
                      if (
                        result?.activeDocumentId !== undefined &&
                        result.activeDocumentId !== ''
                      ) {
                        focusDocument(result.activeDocumentId);
                      } else {
                        focusFallback();
                      }
                    });
                  }}
                >
                  <span aria-hidden="true" className={styles.tabCloseGlyph}>
                    ×
                  </span>
                </button>
              </div>
            );
          })}
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
          onClose={(): void => {
            setContextDocumentId(null);
            if (tabRefs.current.has(contextDocument.documentId)) {
              focusDocument(contextDocument.documentId);
            } else {
              focusFallback();
            }
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
