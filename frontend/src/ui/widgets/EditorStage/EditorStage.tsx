import {
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
} from 'react';

import type { EditorPosition } from '../../components/CodeEditor';
import type { CommittedMarkdownPreview } from '../../components/MarkdownView';
import CodeEditor from '../../components/CodeEditor';
import Pane from '../../components/Pane';
import SplitDivider from '../../components/SplitDivider';
import { appModelAdapter, type AppModelAdapter } from '../../../logic/adapter';
import {
    type LivePreviewAdapter,
    type LivePreviewSnapshot,
    useLivePreviewSnapshot,
} from '../../../logic/hooks/useLivePreview';
import PreviewContextMenu from '../PreviewContextMenu';
import { dispatchAction } from '../../../logic/actions/actionDispatcher';
import { useScrollSync } from '../../../logic/hooks/useScrollSync';
import { type EditorSynchronizationAdapter, useSyncedBuffer } from '../../../logic/hooks/useSyncedBuffer';
import type { EditorScrollPort } from '../../../logic/scrollSync/scrollSyncTypes';
import type { MarkdownStandard } from '../../../logic/markdown/pipeline';
import { extractHeadings, headingAnchor, scrollToAnchor } from '../../../logic/markdown/headings';
import { classifyLink } from '../../../logic/markdown/linkPolicy';
import type { ActiveBuffer, DocumentMetadata, DocumentView } from '../../../logic/store/appModelTypes';
import EditorContextMenu from '../EditorContextMenu';
import { DocumentCommandContext, EditorSessionEpochContext, useEditorSessionAttachment } from '../editorSession';
import { TidyCommandsContext } from '../tidyCommandsContext';
import {
    PreviewPaneContent,
    PreviewPausedStatus,
    activateLinkTarget,
    usePreviewPaneState,
    type PreviewPaneContentProps,
} from '../PreviewPane';
import { EDITOR_TABPANEL_ID } from '../editorTabPanel';
import styles from './EditorStage.module.css';
import { t } from '../../../i18n';
import { useEditorSettings } from '../../../logic/settings/editorSettings';
import { useMinimumWindow } from '../minimumWindow';
import { useSplitRatio } from './useSplitRatio';

export interface EditorStageAdapter extends EditorSynchronizationAdapter, LivePreviewAdapter {
    setDocView?: AppModelAdapter['setDocView'];
}

export interface EditorStageHandle {
    captureViewState: () => void;
    /** Moves keyboard focus to the rendered document; false when it is not shown. */
    focusDocument: () => boolean;
}

export type EditorStageVariant = 'normal' | 'reading';

export interface EditorStageProps {
    activeBuffer: ActiveBuffer;
    activeDocument?: DocumentMetadata;
    adapter?: EditorStageAdapter;
    editorVisible: boolean;
    interactionBlocked?: boolean;
    labelledBy?: string;
    onLiveCursorChange: (cursor: EditorPosition) => void;
    onEditorReady?: (documentId: string) => void;
    onOpenLink?: PreviewPaneContentProps['onOpenLink'];
    fragmentRequest?: FragmentRequest | null;
    onPreviewRefresh?: (accepted: LivePreviewSnapshot) => Promise<LivePreviewSnapshot>;
    onPreviewWarning: (target: string, reason: string) => void;
    panelId?: string;
    previewVisible: boolean;
    readOnly: boolean;
    variant?: EditorStageVariant;
    view: DocumentView;
}

export interface FragmentRequest {
    documentId: string;
    slug: string;
    seq: number;
}

interface ActiveEditorProps {
    activeBuffer: ActiveBuffer;
    adapter: EditorStageAdapter;
    documentPath: string;
    fragmentRequest?: FragmentRequest | null;
    handledFragmentRef: { current: number };
    onLiveCursorChange: (cursor: EditorPosition) => void;
    onEditorReady?: (documentId: string) => void;
    onOpenLink?: PreviewPaneContentProps['onOpenLink'];
    onPreviewWarning: (target: string, reason: string) => void;
    onPreviewScrollHandler: (handler: ((scrollTop: number) => void) | null) => void;
    onScrollPortReady: (port: EditorScrollPort | null) => void;
    readOnly: boolean;
    view: DocumentView;
    visible: boolean;
}

interface ActiveEditorHandle {
    captureViewState: () => void;
}

function isMarkdownStandard(value: string): value is MarkdownStandard {
    return value === 'minimal' || value === 'gfm' || value === 'full';
}

const ActiveEditor = forwardRef<ActiveEditorHandle, ActiveEditorProps>(function ActiveEditor(
    {
        activeBuffer,
        adapter,
        documentPath,
        fragmentRequest,
        handledFragmentRef,
        onLiveCursorChange,
        onEditorReady,
        onOpenLink,
        onPreviewWarning,
        onPreviewScrollHandler,
        onScrollPortReady,
        readOnly,
        view,
        visible,
    }: ActiveEditorProps,
    ref,
): React.JSX.Element {
    const editorSettings = useEditorSettings().settings;
    const viewStateCaptureRef = useRef<(() => void) | null>(null);
    const [mountedEditorEpoch, setMountedEditorEpoch] = useState(0);
    const attachEditor = useEditorSessionAttachment();
    const tidyCommands = useContext(TidyCommandsContext);
    const documentCommands = useContext(DocumentCommandContext);
    const externalEpoch = useContext(EditorSessionEpochContext);
    const synchronizedBuffer = useSyncedBuffer(
        activeBuffer.documentId,
        view,
        adapter,
        activeBuffer.content,
        externalEpoch,
    );

    useEffect((): void => {
        if (
            !visible ||
            fragmentRequest === null ||
            fragmentRequest === undefined ||
            fragmentRequest.seq <= handledFragmentRef.current ||
            fragmentRequest.documentId !== activeBuffer.documentId
        )
            return;
        const content = documentCommands?.getContent();
        if (content?.status !== 'available') return;
        const heading = headingAnchor(extractHeadings(content.value), fragmentRequest.slug);
        if (documentCommands?.setPosition(heading?.line ?? 1, 1).status === 'available') {
            handledFragmentRef.current = fragmentRequest.seq;
        }
    }, [activeBuffer.documentId, documentCommands, fragmentRequest, handledFragmentRef, mountedEditorEpoch, visible]);
    const activationToken = synchronizedBuffer.activationToken;
    const flushSession = synchronizedBuffer.flushActiveSession;
    const attachCurrentEditor = useCallback(
        (editor: Parameters<typeof attachEditor>[1]): void => {
            attachEditor(activeBuffer.documentId, editor, synchronizedBuffer.activationToken);
        },
        [activeBuffer.documentId, attachEditor, synchronizedBuffer.activationToken],
    );

    useEffect((): (() => void) | undefined => {
        if (adapter.registerActiveSession === undefined) {
            return undefined;
        }
        return adapter.registerActiveSession({
            documentId: activeBuffer.documentId,
            activationToken,
            flushActiveSession: async (): Promise<void> => {
                await flushSession(activeBuffer.documentId, activationToken);
            },
        });
    }, [adapter, activeBuffer.documentId, activationToken, flushSession]);

    const synchronizeMountedEditorTheme = useCallback((): void => {
        if (
            visible &&
            fragmentRequest !== null &&
            fragmentRequest !== undefined &&
            fragmentRequest.documentId === activeBuffer.documentId &&
            fragmentRequest.seq > handledFragmentRef.current
        ) {
            setMountedEditorEpoch((epoch) => epoch + 1);
        }
        onEditorReady?.(activeBuffer.documentId);
    }, [activeBuffer.documentId, fragmentRequest, handledFragmentRef, onEditorReady, visible]);

    useEffect((): void => {
        onLiveCursorChange(synchronizedBuffer.liveCursor);
    }, [onLiveCursorChange, synchronizedBuffer.liveCursor]);

    useEffect((): (() => void) => {
        onPreviewScrollHandler(synchronizedBuffer.onPreviewScrollChange);
        return (): void => onPreviewScrollHandler(null);
    }, [onPreviewScrollHandler, synchronizedBuffer.onPreviewScrollChange]);

    useImperativeHandle(
        ref,
        (): ActiveEditorHandle => ({
            captureViewState(): void {
                viewStateCaptureRef.current?.();
            },
        }),
        [],
    );

    return (
        <CodeEditor
            ref={attachCurrentEditor}
            documentId={activeBuffer.documentId}
            initialValue={activeBuffer.content}
            activationId={synchronizedBuffer.activationId}
            fontSize={editorSettings.fontSize as 13 | 14 | 16}
            lineNumbers={editorSettings.lineNumbers ? 'on' : 'off'}
            wordWrap={editorSettings.wordWrap ? 'on' : 'off'}
            initialSelection={{
                start: {
                    lineNumber: view.selection.start.line,
                    column: view.selection.start.column,
                },
                end: {
                    lineNumber: view.selection.end.line,
                    column: view.selection.end.column,
                },
            }}
            readOnly={readOnly}
            visible={visible}
            onViewStateCaptureReady={(capture: (() => void) | null): void => {
                viewStateCaptureRef.current = capture;
            }}
            onBlur={synchronizedBuffer.onBlur}
            onChange={(text: string): void => {
                synchronizedBuffer.onChange(text);
                tidyCommands?.documentChanged(activeBuffer.documentId, text);
            }}
            onCursorPositionChange={synchronizedBuffer.onCursorPositionChange}
            onScrollChange={synchronizedBuffer.onEditorScrollChange}
            onScrollPortReady={onScrollPortReady}
            onLinkActivate={(href): void => {
                activateLinkTarget(activeBuffer.documentId, classifyLink(href, documentPath), {
                    anchor: (fragment): void => {
                        const content = documentCommands?.getContent();
                        if (content?.status !== 'available') return;
                        const heading = headingAnchor(extractHeadings(content.value), fragment);
                        documentCommands?.setPosition(heading?.line ?? 1, 1);
                    },
                    external: adapter.openExternalLink,
                    local: onOpenLink,
                    warn: onPreviewWarning,
                });
            }}
            onSelectionChange={synchronizedBuffer.onSelectionChange}
            onEditorMounted={synchronizeMountedEditorTheme}
        />
    );
});

interface LivePreviewProps {
    activeBuffer: ActiveBuffer;
    adapter: EditorStageAdapter;
    claimScrollRestore: (documentId: string, variant: EditorStageVariant) => boolean;
    documentPath: string;
    fragmentRequest?: FragmentRequest | null;
    handledFragmentRef: { current: number };
    onOpenLink?: PreviewPaneContentProps['onOpenLink'];
    onPreviewRefresh?: (accepted: LivePreviewSnapshot) => Promise<LivePreviewSnapshot>;
    onPreviewWarning: (target: string, reason: string) => void;
    onScrollChange: (scrollTop: number) => void;
    onScrollContainerChange: (container: HTMLElement | null) => void;
    savedScrollTop: number;
    scrollSyncActive: boolean;
    variant: EditorStageVariant;
    visible: boolean;
}

const LivePreview: React.FC<LivePreviewProps> = ({
    activeBuffer,
    adapter,
    claimScrollRestore,
    documentPath,
    fragmentRequest,
    handledFragmentRef,
    onPreviewRefresh,
    onOpenLink,
    onPreviewWarning,
    onScrollChange,
    onScrollContainerChange,
    savedScrollTop,
    scrollSyncActive,
    variant,
    visible,
}: LivePreviewProps): React.JSX.Element | null => {
    const { markdownSettings } = useEditorSettings();
    const storedStandard = markdownSettings?.standard;
    const standard = storedStandard !== undefined && isMarkdownStandard(storedStandard) ? storedStandard : undefined;
    const settingsLoaded = standard !== undefined;
    const accepted = useLivePreviewSnapshot(activeBuffer, adapter);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [committedPreview, setCommittedPreview] = useState<CommittedMarkdownPreview | null>(null);
    const onPreviewCommitted = useCallback((preview: CommittedMarkdownPreview): void => {
        setCommittedPreview((current) =>
            current !== null && current.documentId === preview.documentId && current.content === preview.content
                ? current
                : preview,
        );
    }, []);
    const onRefresh = useCallback(async (): Promise<LivePreviewSnapshot> => {
        if (onPreviewRefresh !== undefined) {
            return onPreviewRefresh(accepted);
        }
        const result = await dispatchAction('refresh-preview', {
            invoke: (): LivePreviewSnapshot => accepted,
            windowFocused: true,
        });
        if (result.status !== 'mutated') {
            throw new Error('Preview refresh is unavailable.');
        }
        return accepted;
    }, [accepted, onPreviewRefresh]);
    const controller = usePreviewPaneState(accepted, onRefresh, activeBuffer.documentId);

    useLayoutEffect((): void => {
        if (!visible) return;
        const node = contentRef.current;
        if (node === null) return;
        if (!claimScrollRestore(activeBuffer.documentId, variant)) return;
        node.scrollTop = savedScrollTop;
    }, [activeBuffer.documentId, claimScrollRestore, savedScrollTop, variant, visible]);

    useLayoutEffect((): void => {
        if (
            !visible ||
            !settingsLoaded ||
            controller.rendered === null ||
            fragmentRequest === null ||
            fragmentRequest === undefined ||
            fragmentRequest.seq <= handledFragmentRef.current ||
            fragmentRequest.documentId !== activeBuffer.documentId ||
            committedPreview?.documentId !== activeBuffer.documentId ||
            committedPreview.source !== controller.rendered.content ||
            contentRef.current === null
        )
            return;
        if (!scrollToAnchor(contentRef.current, fragmentRequest.slug)) contentRef.current.scrollTop = 0;
        handledFragmentRef.current = fragmentRequest.seq;
    }, [
        activeBuffer.documentId,
        committedPreview,
        controller.rendered,
        fragmentRequest,
        handledFragmentRef,
        settingsLoaded,
        visible,
    ]);

    /*
     * Published after the restore above, so whoever synchronizes the panes
     * starts from the offset this document was left at. A paused preview
     * renders nothing to scroll, and reports no container at all.
     *
     * `visible` is load-bearing in the dependencies although the body never
     * reads it: a hidden pane renders no body, so the ref is emptied and later
     * refilled with a fresh node as the arrangement changes. Drop the
     * dependency and this effect stops re-running across that change, leaving
     * a withdrawn container published and nothing synchronized again.
     */
    useLayoutEffect((): (() => void) => {
        onScrollContainerChange(controller.isPaused || !settingsLoaded || !visible ? null : contentRef.current);

        return (): void => {
            onScrollContainerChange(null);
        };
    }, [controller.isPaused, onScrollContainerChange, settingsLoaded, visible]);

    if (!visible) return null;

    return (
        <Pane
            accessory={
                settingsLoaded && controller.isPaused ? (
                    <PreviewPausedStatus
                        currentRefreshError={controller.currentRefreshError}
                        isRefreshing={controller.isRefreshing}
                        onRefresh={controller.refresh}
                    />
                ) : undefined
            }
            ariaLabel={t('editor.previewPane')}
            body={
                <PreviewContextMenu>
                    {(menuHost) => (
                        <div
                            {...menuHost}
                            ref={contentRef}
                            className={styles.previewContent}
                            data-reading-document={variant === 'reading' ? '' : undefined}
                            tabIndex={-1}
                            data-scroll-sync={scrollSyncActive ? 'on' : undefined}
                            onScroll={(event): void => {
                                onScrollChange(event.currentTarget.scrollTop);
                            }}
                        >
                            <PreviewPaneContent
                                ariaLabel={null}
                                committedPreview={committedPreview}
                                controller={controller}
                                documentId={activeBuffer.documentId}
                                documentPath={documentPath}
                                linkAdapter={adapter}
                                notificationOwner={{ warn: onPreviewWarning }}
                                onOpenLink={onOpenLink}
                                onPreviewCommitted={onPreviewCommitted}
                                showPausedStatus={false}
                                {...(standard === undefined ? { settingsLoaded: false as const } : { standard })}
                            />
                        </div>
                    )}
                </PreviewContextMenu>
            }
            header={
                variant === 'reading'
                    ? undefined
                    : {
                          leading: <span className={styles.paneLive}>{t('editor.preview.live')}</span>,
                          trailing:
                              standard === undefined ? undefined : (
                                  <span>{t(`editor.preview.standard.${standard}`)}</span>
                              ),
                      }
            }
            identity="preview"
        />
    );
};

const EditorStage = forwardRef<EditorStageHandle, EditorStageProps>(function EditorStage(
    {
        activeBuffer,
        activeDocument,
        adapter = appModelAdapter,
        fragmentRequest,
        editorVisible,
        interactionBlocked = false,
        labelledBy,
        onLiveCursorChange,
        onEditorReady,
        onOpenLink,
        onPreviewRefresh,
        onPreviewWarning,
        panelId = EDITOR_TABPANEL_ID,
        previewVisible,
        readOnly,
        variant = 'normal',
        view,
    }: EditorStageProps,
    ref,
): React.JSX.Element {
    const activeEditorRef = useRef<ActiveEditorHandle | null>(null);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const minimumWindow = useMinimumWindow();
    const split = editorVisible && previewVisible && !minimumWindow;
    const splitRatio = useSplitRatio(activeBuffer.documentId, view, adapter.setDocView, split);
    const handledEditorFragment = useRef(0);
    const handledPreviewFragment = useRef(0);
    const previewScrollHandlerRef = useRef<((scrollTop: number) => void) | null>(null);
    const registerPreviewScrollHandler = useCallback((handler: ((scrollTop: number) => void) | null): void => {
        previewScrollHandlerRef.current = handler;
    }, []);
    const scrollSyncEnabled = useEditorSettings().settings.scrollSync;
    const [editorPort, setEditorPort] = useState<EditorScrollPort | null>(null);
    const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null);
    const scrollSyncActive = useScrollSync({
        enabled: scrollSyncEnabled,
        editorPort,
        editorVisible,
        previewContainer,
        previewVisible,
    });
    const restoredPreviewRef = useRef<string | null>(null);
    const claimPreviewScrollRestore = useCallback((documentId: string, presentation: EditorStageVariant): boolean => {
        const claim = `${documentId}:${presentation}`;
        if (restoredPreviewRef.current === claim) return false;
        restoredPreviewRef.current = claim;
        return true;
    }, []);

    useImperativeHandle(
        ref,
        (): EditorStageHandle => ({
            captureViewState(): void {
                activeEditorRef.current?.captureViewState();
            },
            focusDocument(): boolean {
                const document = stageRef.current?.querySelector<HTMLElement>('[data-reading-document]');
                document?.focus();
                return document !== null && document !== undefined;
            },
        }),
        [],
    );

    const title = activeDocument?.title ?? t('editor.untitled');
    const encoding = activeDocument?.encoding ?? 'utf-8';
    const lineEnding = activeDocument?.lineEnding ?? 'lf';
    const localizedEncoding = t(`status.encoding.${encoding.toLowerCase()}`);
    const localizedLineEnding = t(`status.lineEnding.${lineEnding.toLowerCase()}`);

    return (
        <div
            ref={stageRef}
            aria-labelledby={labelledBy}
            className={styles.stage}
            id={panelId}
            inert={interactionBlocked}
            role="tabpanel"
            data-split-resizable={split || undefined}
            data-variant={variant}
            style={{ '--editor-split-ratio': splitRatio.ratio } as CSSProperties}
        >
            <Pane
                ariaLabel={t('editor.editorPane')}
                body={
                    <EditorContextMenu>
                        <ActiveEditor
                            ref={activeEditorRef}
                            activeBuffer={activeBuffer}
                            adapter={adapter}
                            documentPath={activeDocument?.path ?? ''}
                            fragmentRequest={fragmentRequest}
                            handledFragmentRef={handledEditorFragment}
                            view={view}
                            readOnly={readOnly}
                            visible={editorVisible}
                            onLiveCursorChange={onLiveCursorChange}
                            onEditorReady={onEditorReady}
                            onOpenLink={onOpenLink}
                            onPreviewWarning={onPreviewWarning}
                            onPreviewScrollHandler={registerPreviewScrollHandler}
                            onScrollPortReady={setEditorPort}
                        />
                    </EditorContextMenu>
                }
                header={{
                    leading: <span>{t('editor.editorTitle', { title })}</span>,
                    trailing: (
                        <span>
                            {t('editor.metadata', {
                                encoding: localizedEncoding,
                                lineEnding: localizedLineEnding,
                            })}
                        </span>
                    ),
                }}
                hidden={!editorVisible}
                identity="editor"
            />
            {split ? (
                <SplitDivider
                    ariaLabel={t('editor.resizeSplit')}
                    identity={activeBuffer.documentId}
                    value={splitRatio.ratio}
                    valueText={(ratio) => t('editor.splitPercentage', { percent: Math.round(ratio * 100) })}
                    getWidth={() => {
                        const panes = stageRef.current?.querySelectorAll<HTMLElement>('[data-pane-identity]');
                        return Array.from(panes ?? []).reduce(
                            (width, pane) => width + pane.getBoundingClientRect().width,
                            0,
                        );
                    }}
                    onResize={splitRatio.resize}
                    onCommit={splitRatio.commit}
                />
            ) : null}
            <LivePreview
                key={activeBuffer.documentId}
                activeBuffer={activeBuffer}
                adapter={adapter}
                fragmentRequest={fragmentRequest}
                handledFragmentRef={handledPreviewFragment}
                claimScrollRestore={claimPreviewScrollRestore}
                documentPath={activeDocument?.path ?? ''}
                onPreviewRefresh={onPreviewRefresh}
                onOpenLink={onOpenLink}
                onPreviewWarning={onPreviewWarning}
                onScrollChange={(scrollTop: number): void => {
                    previewScrollHandlerRef.current?.(scrollTop);
                }}
                onScrollContainerChange={setPreviewContainer}
                savedScrollTop={view.scroll.preview}
                scrollSyncActive={scrollSyncActive}
                variant={variant}
                visible={previewVisible}
            />
        </div>
    );
});

export default EditorStage;
