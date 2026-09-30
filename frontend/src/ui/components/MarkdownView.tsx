import '../../logic/theme/generatedHighlight.css';
import { Component, createContext, memo, useContext, useMemo, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';

import { t } from '../../i18n';
import { classifyLink, type LinkTarget } from '../../logic/markdown/linkPolicy';
import { createPipeline, type MarkdownStandard } from '../../logic/markdown/pipeline';
import { markdownComponents, previewUrlTransform, renderImageFallback } from '../../logic/markdown/renderer';
import styles from './MarkdownView.module.css';
import AlertBox from './AlertBox';
import type { AlertKind } from '../../logic/markdown/syntax/alerts';

const remarkRehypeOptions = { allowDangerousHtml: true };

export interface MarkdownViewProps {
    source: string;
    standard: MarkdownStandard;
    suspended?: boolean;
    committedPreview?: CommittedMarkdownPreview | null;
    onPreviewCommitted?: (preview: CommittedMarkdownPreview) => void;
    documentId?: string;
    documentPath?: string;
    onActivateLink?: (documentId: string, target: LinkTarget) => void;
    imageSourceResolver?: (source: string) => string | undefined;
}

interface PreviewImageProps {
    alt?: string;
    source?: string;
    title?: string;
}

function PreviewImage({ alt, source, title }: PreviewImageProps): React.JSX.Element {
    const [failedSource, setFailedSource] = useState<string>();
    if (source === undefined || failedSource === source) {
        return renderImageFallback(alt);
    }

    return (
        <img
            alt={alt ?? 'Image unavailable'}
            onError={(): void => setFailedSource(source)}
            src={source}
            title={title}
        />
    );
}

type PreviewRuntimeProps = Pick<
    MarkdownViewProps,
    'documentId' | 'documentPath' | 'onActivateLink' | 'imageSourceResolver'
>;

// Committed elements can outlive their original renderer. Stable component types
// read the current props here, including when a retained tree is mounted again.
const PreviewRuntimeContext = createContext<PreviewRuntimeProps>({});
const components: Components = {
    ...markdownComponents,
    div: function PreviewAlert({ children, className, node, ...props }): React.JSX.Element {
        const kind = /(?:^|\s)md-alert-(note|tip|important|warning|caution)(?:\s|$)/u.exec(className ?? '')?.[1] as
            AlertKind | undefined;
        if (kind !== undefined && className?.split(/\s+/u).includes('md-alert')) {
            const sourceLine = node?.properties.dataSourceLine;
            return (
                <AlertBox
                    kind={kind}
                    sourceLine={
                        typeof sourceLine === 'string' || typeof sourceLine === 'number' ? sourceLine : undefined
                    }
                >
                    {children}
                </AlertBox>
            );
        }
        return (
            <div {...props} className={className}>
                {children}
            </div>
        );
    },
    img: function PreviewResolvedImage({ alt, node: _node, src, title }): React.JSX.Element {
        void _node;
        const { imageSourceResolver } = useContext(PreviewRuntimeContext);
        let source: string | undefined;
        if (src !== undefined) {
            try {
                source = imageSourceResolver?.(src);
            } catch {
                source = undefined;
            }
        }
        return <PreviewImage alt={alt} source={source} title={title} />;
    },
    a: function PreviewLink({ children, href, node: _node, title, ...linkProps }): React.JSX.Element {
        void _node;
        const { documentId, documentPath, onActivateLink } = useContext(PreviewRuntimeContext);
        return (
            <a
                {...linkProps}
                href={href}
                title={title}
                onClick={(event): void => {
                    event.preventDefault();
                    if (href !== undefined && documentId !== undefined) {
                        onActivateLink?.(documentId, classifyLink(href, documentPath));
                    }
                }}
            >
                {children}
            </a>
        );
    },
};

type RenderCandidate = (CommittedMarkdownPreview & { failed: false }) | { failed: true };

export interface CommittedMarkdownPreview {
    documentId: string | undefined;
    content: ReactNode;
}

interface CommittedPreviewProps {
    candidate: RenderCandidate | null;
    committedPreview?: CommittedMarkdownPreview | null;
    documentId?: string;
    onPreviewCommitted?: (preview: CommittedMarkdownPreview) => void;
}

class CommittedPreview extends Component<CommittedPreviewProps> {
    private committed: CommittedMarkdownPreview | null = null;

    componentDidMount(): void {
        this.commitSuccessfulRender();
    }

    componentDidUpdate(): void {
        this.commitSuccessfulRender();
    }

    private commitSuccessfulRender(): void {
        const { candidate, documentId, onPreviewCommitted } = this.props;
        if (candidate === null || candidate.failed) return;
        if (
            this.committed !== null &&
            this.committed.documentId === documentId &&
            this.committed.content === candidate.content
        )
            return;
        this.committed = { documentId: candidate.documentId, content: candidate.content };
        onPreviewCommitted?.(this.committed);
    }

    render(): React.JSX.Element | null {
        const { candidate, committedPreview, documentId } = this.props;
        if (candidate === null) return null;
        const retained =
            this.committed?.documentId === documentId
                ? this.committed
                : committedPreview?.documentId === documentId
                  ? committedPreview
                  : null;
        const hasContent = !candidate.failed || retained !== null;
        const content = candidate.failed ? retained?.content : candidate.content;

        return (
            <>
                {candidate.failed ? (
                    <p role="alert">{t(hasContent ? 'preview.renderError.message' : 'preview.renderError.empty')}</p>
                ) : null}
                {hasContent ? <article className={`${styles.preview} gme-preview`}>{content}</article> : null}
            </>
        );
    }
}

/*
 * Memoized on `source` because rendering it is not cheap and the pane above is
 * re-rendered for reasons that have nothing to do with the document.
 * `EditorView` passes `PreviewPane` an inline `onRefresh` arrow, so the pane
 * gets a fresh prop identity on every parent render, and without this the whole
 * GFM pipeline ran again each time.
 *
 * That is invisible on a small note and decisive at the size needed for
 * live preview to keep working at: the shipped component takes about 1.5 s to
 * render 2 MiB of ordinary short-line prose under WebKit, and paying that per
 * keystroke is what makes an editor stop accepting keystrokes. The expensive
 * render is cached by source, standard and document identity; changing the
 * link callback only updates the click handler.
 */
const MarkdownView: React.FC<MarkdownViewProps> = memo(function MarkdownView({
    source,
    standard,
    suspended = false,
    committedPreview,
    onPreviewCommitted,
    documentId,
    documentPath,
    onActivateLink,
    imageSourceResolver,
}: MarkdownViewProps): React.JSX.Element {
    const runtimeProps = useMemo(
        () => ({ documentId, documentPath, onActivateLink, imageSourceResolver }),
        [documentId, documentPath, onActivateLink, imageSourceResolver],
    );

    const candidate = useMemo(() => {
        if (suspended) return null;
        try {
            const pipeline = createPipeline(standard);
            return {
                failed: false as const,
                documentId,
                content: Markdown({
                    children: source,
                    components,
                    rehypePlugins: pipeline.rehypePlugins,
                    remarkPlugins: pipeline.remarkPlugins,
                    remarkRehypeOptions,
                    urlTransform: previewUrlTransform,
                }),
            };
        } catch {
            return { failed: true as const };
        }
    }, [documentId, source, standard, suspended]);

    return (
        <PreviewRuntimeContext.Provider value={runtimeProps}>
            <CommittedPreview
                candidate={candidate}
                committedPreview={committedPreview}
                documentId={documentId}
                onPreviewCommitted={onPreviewCommitted}
            />
        </PreviewRuntimeContext.Provider>
    );
});

export default MarkdownView;
