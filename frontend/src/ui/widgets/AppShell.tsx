import { useState } from 'react';

import { useAppSelector } from '../../logic/store';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import type {
  ClosePlanKind,
  ConflictPreview,
  DocumentTransitionResult,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import StatusBar from '../components/StatusBar';
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
  const parityRoute =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case');
  const parityCase =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('parity-case')
      : null;
  const parityFamily = parityCase?.startsWith('primary:toolbar-overflow:')
    ? 'toolbar-overflow'
    : undefined;
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

  return (
    <WorkspaceLayout
      documentState={hasActiveDocument ? 'active' : 'empty'}
      parityFamily={parityFamily}
      parityShell={parityRoute}
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
          cursor={liveCursor}
          encoding={activeDocument.encoding}
          lineEnding={activeDocument.lineEnding}
          status={activeDocument.status}
          capability={activeDocument.capability}
          writeInFlight={activeDocument.writeInFlight}
          wordCount={activeDocument.wordCount}
          autosave={fileSettings.autosave}
          markdownStandard={markdownSettings.standard}
        />
      ) : null}
    </WorkspaceLayout>
  );
};

export default AppShell;
