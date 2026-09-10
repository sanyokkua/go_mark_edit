import { useState } from 'react';

import { formatNumber, t } from '../../i18n';
import { useAppSelector } from '../../logic/store';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import type {
  ClosePlanKind,
  ConflictPreview,
  DocumentTransitionResult,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import StatusBar, { type StatusFact } from '../components/StatusBar';
import EditorView from './EditorView';
import Launcher from './Launcher';
import WorkspaceLayout from './WorkspaceLayout';

export interface AppShellProps {
  onNewDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
  onOpenDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
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
  onExternalConflict?: (preview: ConflictPreview) => void;
  onOpenRecentFile?: (
    path: string,
    expectedTabSetRevision: number,
  ) => Promise<unknown>;
}

const AppShell: React.FC<AppShellProps> = ({
  onNewDocument,
  onOpenDocument,
  onActivateDocument,
  onCloseDocument,
  onExternalConflict,
  onOpenRecentFile,
}: AppShellProps): React.JSX.Element => {
  const { fileSettings, markdownSettings } = useEditorSettings();
  const hasActiveDocument = useAppSelector(
    (state) =>
      state.documents.activeDocumentId !== null &&
      state.documents.activeDocumentId !== '',
  );
  const activeDocument = useAppSelector((state) =>
    hasActiveDocument && state.documents.activeDocumentId !== null
      ? state.documents.byId[state.documents.activeDocumentId]
      : undefined,
  );
  const [liveCursor, setLiveCursor] = useState({
    lineNumber: activeDocument?.view.cursor.line ?? 1,
    column: activeDocument?.view.cursor.column ?? 1,
  });
  const recentFiles = useAppSelector(
    (state) => state.documents.recentFiles ?? [],
  );
  const showLauncher =
    onNewDocument !== undefined ||
    onOpenDocument !== undefined ||
    recentFiles.length > 0;
  const tabSetRevision = useAppSelector(
    (state) => state.documents.tabSetRevision,
  );
  const statusFacts: readonly StatusFact[] =
    activeDocument === undefined
      ? []
      : [
          {
            id: 'standard-kind',
            rowLabel: t('status.markdown', {
              standard: t(
                `status.markdownStandard.${markdownSettings.standard}`,
              ),
            }),
            detailLabel: t('status.markdown', {
              standard: t(
                `status.markdownStandard.${markdownSettings.standard}`,
              ),
            }),
            value: '',
            dropPriority: 0,
            marker: 'accent-dot',
          },
          {
            id: 'cursor',
            rowLabel: t('status.cursor', {
              column: liveCursor.column,
              line: liveCursor.lineNumber,
            }),
            detailLabel: t('status.cursor', {
              column: liveCursor.column,
              line: liveCursor.lineNumber,
            }),
            value: '',
            dropPriority: 1,
          },
          {
            id: 'count',
            rowLabel: t('status.words', {
              count: formatNumber(activeDocument.wordCount),
            }),
            detailLabel: t('status.words', {
              count: formatNumber(activeDocument.wordCount),
            }),
            value: '',
            dropPriority: 2,
          },
          {
            id: 'encoding',
            rowLabel: t(
              `status.encoding.${activeDocument.encoding.toLowerCase()}`,
            ),
            detailLabel: t(
              `status.encoding.${activeDocument.encoding.toLowerCase()}`,
            ),
            value: '',
            dropPriority: 3,
            placement: 'trailing',
          },
          {
            id: 'line-ending',
            rowLabel: t(
              `status.lineEnding.${activeDocument.lineEnding.toLowerCase()}`,
            ),
            detailLabel: t(
              `status.lineEnding.${activeDocument.lineEnding.toLowerCase()}`,
            ),
            value: '',
            dropPriority: 4,
            placement: 'trailing',
          },
          {
            id: 'autosave',
            rowLabel: t(
              fileSettings.autosave
                ? 'status.autosave.on'
                : 'status.autosave.off',
            ),
            detailLabel: t(
              fileSettings.autosave
                ? 'status.autosave.on'
                : 'status.autosave.off',
            ),
            value: '',
            dropPriority: 5,
            placement: 'trailing',
          },
        ];

  return (
    <WorkspaceLayout
      documentState={hasActiveDocument ? 'active' : 'empty'}
    >
      {!hasActiveDocument && showLauncher ? (
        <Launcher
          recentFiles={recentFiles}
          onNewDocument={
            onNewDocument === undefined
              ? undefined
              : (): Promise<unknown> => onNewDocument(tabSetRevision)
          }
          onOpenDocument={
            onOpenDocument === undefined
              ? undefined
              : (): Promise<unknown> => onOpenDocument(tabSetRevision)
          }
          onOpenRecentFile={
            onOpenRecentFile === undefined
              ? undefined
              : (path): Promise<unknown> =>
                  onOpenRecentFile(path, tabSetRevision)
          }
        />
      ) : null}
      <EditorView
        onNewDocument={onNewDocument}
        onActivateDocument={onActivateDocument}
        onCloseDocument={onCloseDocument}
        onExternalConflict={onExternalConflict}
        onLiveCursorChange={setLiveCursor}
      />
      {hasActiveDocument && activeDocument !== undefined ? (
        <StatusBar
          facts={statusFacts}
          saveIdentity={t(
            `status.saveStatus.${activeDocument.status ?? 'not-saved'}`,
          )}
          status={activeDocument.status}
          capability={activeDocument.capability}
          transient={
            activeDocument.writeInFlight ? t('status.writeInFlight') : undefined
          }
        />
      ) : null}
    </WorkspaceLayout>
  );
};

export default AppShell;
