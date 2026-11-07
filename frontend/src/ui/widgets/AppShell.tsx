import { useEffect, useState, useSyncExternalStore } from 'react';

import { formatNumber, t } from '../../i18n';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { leaveReading } from '../../logic/store/readingSlice';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import * as problemsSummary from '../../logic/operations/problemsSummary';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import type {
    ClosePlanKind,
    ConflictPreview,
    DocumentTransitionResult,
    RecentItem,
    TabTransitionResult,
} from '../../logic/store/appModelTypes';
import StatusBar, { type StatusFact } from '../components/StatusBar';
import Icon from '../primitives/Icon';
import EditorView, { type EditorViewProps } from './EditorView';
import Launcher from './Launcher';
import WorkspaceLayout, { type WorkspaceLayoutProps } from './WorkspaceLayout';
import WindowDropTarget from './WindowDropTarget';

export interface AppShellProps
    extends
        Pick<EditorViewProps, 'tabRevealRequest' | 'editorFocusRequest' | 'onOpenLink' | 'fragmentRequest'>,
        Pick<WorkspaceLayoutProps, 'treeRevealRequest'> {
    problemsOpen?: boolean;
    onToggleProblems?: () => void;
    onCloseProblems?: () => void;
    dropEpoch?: number;
    onNewDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
    onOpenDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
    onOpenFolder?: () => Promise<unknown>;
    onActivateDocument?: (documentId: string, expectedTabSetRevision: number) => Promise<DocumentTransitionResult>;
    onCloseDocument?: (
        documentId: string,
        expectedTabSetRevision: number,
        kind?: ClosePlanKind,
        targetDocumentIds?: string[],
    ) => Promise<TabTransitionResult>;
    onExternalConflict?: (preview: ConflictPreview) => void;
    onOpenRecentItem?: (item: RecentItem, expectedTabSetRevision: number) => Promise<unknown>;
}

const AppShell: React.FC<AppShellProps> = ({
    problemsOpen = false,
    onToggleProblems,
    onCloseProblems,
    dropEpoch,
    onNewDocument,
    onOpenDocument,
    onOpenFolder,
    onActivateDocument,
    onCloseDocument,
    onExternalConflict,
    onOpenLink,
    fragmentRequest,
    treeRevealRequest,
    onOpenRecentItem,
    tabRevealRequest,
    editorFocusRequest,
}: AppShellProps): React.JSX.Element => {
    const { fileSettings, markdownSettings } = useEditorSettings();
    const publishedSummary = useSyncExternalStore(problemsSummary.subscribe, problemsSummary.getSnapshot);
    const hasActiveDocument = useAppSelector(
        (state) => state.documents.activeDocumentId !== null && state.documents.activeDocumentId !== '',
    );
    const activeDocument = useAppSelector((state) =>
        hasActiveDocument && state.documents.activeDocumentId !== null
            ? state.documents.byId[state.documents.activeDocumentId]
            : undefined,
    );
    const summary = activeDocument?.documentId === problemsSummary.getActiveDocumentId() ? publishedSummary : null;
    const [liveCursor, setLiveCursor] = useState({
        lineNumber: activeDocument?.view.cursor.line ?? 1,
        column: activeDocument?.view.cursor.column ?? 1,
    });
    const dispatch = useAppDispatch();
    const reading = useAppSelector((state) => state.reading.active);
    useEffect((): void => {
        if (reading && !hasActiveDocument) dispatch(leaveReading());
    }, [dispatch, hasActiveDocument, reading]);
    const recentItems = useAppSelector((state) => state.documents.recentItems ?? []);
    const showLauncher = onNewDocument !== undefined || onOpenDocument !== undefined || recentItems.length > 0;
    const tabSetRevision = useAppSelector((state) => state.documents.tabSetRevision);
    const buildStatusFacts = (): readonly StatusFact[] => {
        if (activeDocument === undefined) return [];

        const facts: StatusFact[] = [];
        if (markdownSettings !== undefined) {
            const label = t('status.markdown', {
                standard: t(`status.markdownStandard.${markdownSettings.standard}`),
            });
            facts.push({
                id: 'standard-kind',
                rowLabel: label,
                detailLabel: label,
                value: '',
                dropPriority: 0,
                marker: 'accent-dot',
            });
        }
        if (summary !== null) {
            const title = t('problems.title');
            const count = formatNumber(summary.total);
            const staleSuffix = summary.stale ? ` · ${t('status.problems.stale')}` : '';
            facts.push({
                id: 'problems',
                rowLabel: (
                    <>
                        {title} {count}
                        {summary.stale ? <Icon name="warning" /> : null}
                    </>
                ),
                rowAriaLabel: t('status.problems.count', { count }) + staleSuffix,
                detailLabel: title,
                value: count + staleSuffix,
                dropPriority: 1,
                pressed: problemsOpen,
                onActivate: (): void => {
                    if (onToggleProblems === undefined) return;
                    void dispatchAction('toggle-problems', {
                        documentId: activeDocument.documentId,
                        windowFocused: true,
                        invoke: onToggleProblems,
                    });
                },
            });
        }
        facts.push(
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
                dropPriority: summary === null ? 1 : 2,
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
                dropPriority: 3,
            },
            {
                id: 'encoding',
                rowLabel: t(`status.encoding.${activeDocument.encoding.toLowerCase()}`),
                detailLabel: t(`status.encoding.${activeDocument.encoding.toLowerCase()}`),
                value: '',
                dropPriority: 4,
                placement: 'trailing',
            },
            {
                id: 'line-ending',
                rowLabel: t(`status.lineEnding.${activeDocument.lineEnding.toLowerCase()}`),
                detailLabel: t(`status.lineEnding.${activeDocument.lineEnding.toLowerCase()}`),
                value: '',
                dropPriority: 5,
                placement: 'trailing',
            },
            {
                id: 'autosave',
                rowLabel: t(fileSettings.autosave ? 'status.autosave.on' : 'status.autosave.off'),
                detailLabel: t(fileSettings.autosave ? 'status.autosave.on' : 'status.autosave.off'),
                value: '',
                dropPriority: 6,
                placement: 'trailing',
            },
        );
        return facts;
    };
    const statusFacts = buildStatusFacts();

    const renderLauncher = (): React.JSX.Element | null => {
        if (hasActiveDocument || !showLauncher) return null;
        return (
            <Launcher
                recentItems={recentItems}
                onNewDocument={
                    onNewDocument === undefined ? undefined : (): Promise<unknown> => onNewDocument(tabSetRevision)
                }
                onOpenDocument={
                    onOpenDocument === undefined ? undefined : (): Promise<unknown> => onOpenDocument(tabSetRevision)
                }
                onOpenFolder={onOpenFolder}
                onOpenRecentItem={
                    onOpenRecentItem === undefined
                        ? undefined
                        : (item): Promise<unknown> => onOpenRecentItem(item, tabSetRevision)
                }
            />
        );
    };

    return (
        <WorkspaceLayout documentState={hasActiveDocument ? 'active' : 'empty'} treeRevealRequest={treeRevealRequest}>
            <WindowDropTarget dropEpoch={dropEpoch} />
            {renderLauncher()}
            <EditorView
                problemsOpen={problemsOpen}
                problemsSummary={summary}
                onCloseProblems={onCloseProblems}
                tabRevealRequest={tabRevealRequest}
                editorFocusRequest={editorFocusRequest}
                onOpenLink={onOpenLink}
                fragmentRequest={fragmentRequest}
                onNewDocument={onNewDocument}
                onActivateDocument={onActivateDocument}
                onCloseDocument={onCloseDocument}
                onExternalConflict={onExternalConflict}
                onLiveCursorChange={setLiveCursor}
            />
            {hasActiveDocument && activeDocument !== undefined && !reading ? (
                <StatusBar
                    facts={statusFacts}
                    saveIdentity={t(`status.saveStatus.${activeDocument.status ?? 'not-saved'}`)}
                    status={activeDocument.status}
                    capability={activeDocument.capability}
                    transient={activeDocument.writeInFlight ? t('status.writeInFlight') : undefined}
                />
            ) : null}
        </WorkspaceLayout>
    );
};

export default AppShell;
