import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { EditorPosition } from '../components/CodeEditor';
import { appModelAdapter } from '../../logic/adapter';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import type { LivePreviewSnapshot } from '../../logic/hooks/useLivePreview';
import type { ProblemsSummary } from '../../logic/operations/problemsSummary';
import type { LintFinding } from '../../logic/tidy/protocol';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { setViewArrangement } from '../../logic/store/docViewCommands';
import { notifyToast } from '../../logic/store/notificationsSlice';
import type {
    ClosePlanKind,
    ConflictPreview,
    DocumentTransitionResult,
    DocumentView,
    TabTransitionResult,
    ViewArrangement,
} from '../../logic/store/appModelTypes';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';
import type { DocumentTabsProps } from './DocumentTabs/DocumentTabs';
import DocumentTabs from './DocumentTabs/DocumentTabs';
import FormattingToolbar from './FormattingToolbar/FormattingToolbar';
import { useReadingPresentation } from './useReadingPresentation';
import EditorStage, {
    type EditorStageAdapter,
    type EditorStageHandle,
    type EditorStageProps,
} from './EditorStage/EditorStage';
import ProblemsPanel from './ProblemsPanel/ProblemsPanel';
import { EDITOR_TABPANEL_ID, tabElementId } from './editorTabPanel';
import { useMinimumWindow } from './minimumWindow';
import styles from './EditorView.module.css';
import { t } from '../../i18n';
import { useModalState } from './modalStateContext';

export type EditorViewAdapter = EditorStageAdapter;

function fallbackView(): DocumentView {
    return {
        arrangement: 'editor',
        editorVisible: true,
        previewVisible: false,
        cursor: { line: 1, column: 1 },
        selection: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 1 },
        },
        scroll: { editor: 0, preview: 0 },
    };
}

export interface EditorViewProps {
    problemsOpen?: boolean;
    problemsSummary?: ProblemsSummary | null;
    onCloseProblems?: () => void;
    tabRevealRequest?: DocumentTabsProps['revealRequest'];
    editorFocusRequest?: { documentId: string; sequence: number } | null;
    adapter?: EditorViewAdapter;
    tabAdapter?: DocumentTabsProps['adapter'];
    onNewDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
    onActivateDocument?: (documentId: string, expectedTabSetRevision: number) => Promise<DocumentTransitionResult>;
    onCloseDocument?: (
        documentId: string,
        expectedTabSetRevision: number,
        kind?: ClosePlanKind,
        targetDocumentIds?: string[],
    ) => Promise<TabTransitionResult>;
    onExternalConflict?: (preview: ConflictPreview) => void;
    onOpenLink?: EditorStageProps['onOpenLink'];
    fragmentRequest?: EditorStageProps['fragmentRequest'];
    onLiveCursorChange?: (cursor: EditorPosition) => void;
}

function arrangementFor(view: DocumentView): ViewArrangement {
    if (view.editorVisible && view.previewVisible) {
        return 'split';
    }
    if (view.previewVisible) {
        return 'preview';
    }
    return 'editor';
}

const EditorView: React.FC<EditorViewProps> = ({
    problemsOpen = false,
    problemsSummary = null,
    onCloseProblems,
    adapter = appModelAdapter,
    tabAdapter,
    onNewDocument,
    onActivateDocument,
    onCloseDocument,
    onExternalConflict,
    onOpenLink,
    fragmentRequest,
    onLiveCursorChange: onLiveCursorChangeProp,
    tabRevealRequest,
    editorFocusRequest,
}: EditorViewProps): React.JSX.Element | null => {
    const dispatch = useAppDispatch();
    const activeBuffer = useContext(EditorSessionContext);
    const minimumWindow = useMinimumWindow();
    const reading = useAppSelector((state) => state.reading.active);
    const tabsShown = useAppSelector((state) => state.reading.tabsShown);
    const modalOpen = useModalState();
    const documentCommands = useContext(DocumentCommandContext);
    const handledEditorFocus = useRef(0);
    const [editorReadyEpoch, setEditorReadyEpoch] = useState(0);
    const pendingProblem = useRef<{ documentId: string; finding: LintFinding } | null>(null);
    const stageRef = useRef<EditorStageHandle | null>(null);
    const activeDocument = useAppSelector((state) => {
        if (activeBuffer === null) {
            return undefined;
        }
        return state.documents.byId[activeBuffer.documentId];
    });
    const activeDocumentReadOnly = activeDocument?.capability !== undefined && activeDocument.capability !== 'writable';
    useEffect((): void => {
        if (
            editorFocusRequest === undefined ||
            editorFocusRequest === null ||
            handledEditorFocus.current >= editorFocusRequest.sequence ||
            modalOpen ||
            activeBuffer?.documentId !== editorFocusRequest.documentId
        )
            return;
        if (documentCommands?.focus().status === 'available') {
            handledEditorFocus.current = editorFocusRequest.sequence;
        }
    }, [activeBuffer?.documentId, documentCommands, editorFocusRequest, editorReadyEpoch, modalOpen]);
    const onEditorReady = useCallback(
        (documentId: string): void => {
            if (editorFocusRequest?.documentId === documentId) {
                setEditorReadyEpoch((epoch) => epoch + 1);
            }
        },
        [editorFocusRequest?.documentId],
    );
    useLayoutEffect((): void => {
        if (reading && activeDocument?.view.editorVisible === true) {
            stageRef.current?.captureViewState();
        }
    }, [reading, activeDocument?.view.editorVisible]);
    useReadingPresentation({
        reading,
        modalOpen,
        focusDocument: (): boolean => stageRef.current?.focusDocument() ?? false,
        focusEditor: (): void => {
            documentCommands?.focus();
        },
    });
    const onArrangementChange = useCallback(
        (nextArrangement: ViewArrangement): void => {
            if (nextArrangement === 'preview') {
                stageRef.current?.captureViewState();
            }
            void dispatch(setViewArrangement(nextArrangement));
        },
        [dispatch],
    );
    const onLiveCursorChange = useCallback(
        (cursor: EditorPosition): void => {
            onLiveCursorChangeProp?.(cursor);
        },
        [onLiveCursorChangeProp],
    );
    const onPreviewWarning = useCallback(
        (target: string, reason: string): void => {
            dispatch(
                notifyToast({
                    code: 'preview-link-refused',
                    message: t('preview.linkRefused.message', { reason, target }),
                    severity: 'warning',
                    subject: target,
                    title: t('preview.linkRefused.title'),
                }),
            );
        },
        [dispatch],
    );
    const onPreviewRefresh = useCallback(async (accepted: LivePreviewSnapshot): Promise<LivePreviewSnapshot> => {
        const result = await dispatchAction('refresh-preview', {
            invoke: (): LivePreviewSnapshot => accepted,
            windowFocused: true,
        });
        if (result.status !== 'mutated') {
            throw new Error('Preview refresh is unavailable.');
        }
        return accepted;
    }, []);
    const activateFinding = useCallback(
        (finding: LintFinding): void => {
            if (activeDocument?.view.editorVisible === false && activeBuffer !== null) {
                pendingProblem.current = { documentId: activeBuffer.documentId, finding };
                void dispatch(setViewArrangement('editor'))
                    .unwrap()
                    .catch((): void => {
                        pendingProblem.current = null;
                    });
                return;
            }
            if (documentCommands?.setPosition(finding.startLine, finding.startColumn).status === 'available') {
                documentCommands.focus();
            }
        },
        [activeBuffer, activeDocument?.view.editorVisible, dispatch, documentCommands],
    );
    useEffect(() => {
        const pending = pendingProblem.current;
        if (pending === null) return;
        if (activeBuffer?.documentId !== pending.documentId) {
            pendingProblem.current = null;
            return;
        }
        if (activeDocument?.view.editorVisible !== true) return;
        if (
            documentCommands?.setPosition(pending.finding.startLine, pending.finding.startColumn).status === 'available'
        ) {
            documentCommands.focus();
            pendingProblem.current = null;
        }
    }, [activeBuffer?.documentId, activeDocument?.view.editorVisible, documentCommands]);

    if (activeBuffer === null) {
        return null;
    }

    const view = activeDocument?.view ?? fallbackView();
    const previewVisible =
        reading || (minimumWindow ? view.previewVisible && !view.editorVisible : view.previewVisible);
    const editorVisible = !reading && (minimumWindow ? !previewVisible : view.editorVisible);
    const arrangement = arrangementFor(view);

    return (
        <section aria-label={t('editor.view')} className={styles.editorView}>
            <DocumentTabs
                adapter={tabAdapter}
                className={reading ? styles.tabsOverlay : undefined}
                hidden={reading && !tabsShown}
                revealRequest={tabRevealRequest}
                modalOpen={modalOpen}
                onActivateDocument={onActivateDocument}
                onCloseDocument={onCloseDocument}
                onExternalConflict={onExternalConflict}
                onNewDocument={onNewDocument}
            />
            {reading ? null : <FormattingToolbar arrangement={arrangement} onArrangementChange={onArrangementChange} />}
            <EditorStage
                ref={stageRef}
                activeBuffer={activeBuffer}
                activeDocument={activeDocument}
                adapter={adapter}
                editorVisible={editorVisible}
                interactionBlocked={modalOpen}
                labelledBy={activeBuffer.documentId === '' ? undefined : tabElementId(activeBuffer.documentId)}
                onLiveCursorChange={onLiveCursorChange}
                onEditorReady={onEditorReady}
                onPreviewRefresh={onPreviewRefresh}
                onPreviewWarning={onPreviewWarning}
                onOpenLink={onOpenLink}
                fragmentRequest={fragmentRequest}
                panelId={EDITOR_TABPANEL_ID}
                previewVisible={previewVisible}
                readOnly={activeDocumentReadOnly}
                variant={reading ? 'reading' : 'normal'}
                view={view}
            />
            {!reading && problemsOpen && onCloseProblems !== undefined ? (
                <div className={styles.problemsDock}>
                    <ProblemsPanel summary={problemsSummary} onActivate={activateFinding} onClose={onCloseProblems} />
                </div>
            ) : null}
        </section>
    );
};

export default EditorView;
