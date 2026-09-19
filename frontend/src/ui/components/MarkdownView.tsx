import { Children, isValidElement, memo, useMemo, useState, type ReactNode } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';

import { classifyLink, type LinkTarget } from '../../logic/markdown/linkPolicy';
import {
    baseGfmRehypePlugins,
    baseGfmRemarkPlugins,
    markdownComponents,
    previewUrlTransform,
    renderImageFallback,
} from '../../logic/markdown/renderer';
import styles from './MarkdownView.module.css';

export interface MarkdownViewProps {
    source: string;
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

function textContent(children: ReactNode): string {
    return Children.toArray(children)
        .map((child): string => {
            if (typeof child === 'string' || typeof child === 'number') {
                return String(child);
            }
            if (isValidElement<{ children?: ReactNode }>(child)) {
                return textContent(child.props.children);
            }
            return '';
        })
        .join('');
}

function headingId(children: ReactNode): string | undefined {
    const value = textContent(children)
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/gu, '');
    return value === '' ? undefined : value;
}

/**
 * `react-markdown` forwards a sanitized `data-source-line` (see
 * `logic/markdown/sourceLines.ts`) as this hyphenated prop; it is not part of
 * `ExtraProps`, which only covers the `node` field.
 */
type HeadingProps = React.JSX.IntrinsicElements['h1'] & ExtraProps & { 'data-source-line'?: number };

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
 * keystroke is what makes an editor stop accepting keystrokes. `source` is the
 * only prop, and the component is pure in it, so the comparison is the default
 * shallow one.
 */
const MarkdownView: React.FC<MarkdownViewProps> = memo(function MarkdownView({
    source,
    documentId,
    documentPath,
    onActivateLink,
    imageSourceResolver,
}: MarkdownViewProps): React.JSX.Element {
    /*
     * Memoized on the props its renderers close over. `Markdown` treats each
     * key here as a component type, so a fresh object on every render — even
     * one where only unrelated pane state changed — gives every heading,
     * link and image a new type and remounts them instead of reconciling in
     * place. Holding this identity steady is what lets an unrelated
     * re-render (or a source change elsewhere in the document) reuse the
     * existing elements.
     */
    const components = useMemo<Components>(() => {
        const activateLink = (href: string | undefined): void => {
            if (href === undefined || documentId === undefined) return;
            onActivateLink?.(documentId, classifyLink(href, documentPath));
        };

        return {
            ...markdownComponents,
            img({ alt, node: _node, src, title }): React.JSX.Element {
                void _node;
                const source = src === undefined ? undefined : imageSourceResolver?.(src);
                return <PreviewImage alt={alt} source={source} title={title} />;
            },
            a({ children, href, node: _node, title, ...linkProps }): React.JSX.Element {
                void _node;
                return (
                    <a
                        {...linkProps}
                        href={href}
                        title={title}
                        onClick={(event): void => {
                            event.preventDefault();
                            activateLink(href);
                        }}
                    >
                        {children}
                    </a>
                );
            },
            h1({ children, 'data-source-line': dataSourceLine }: HeadingProps): React.JSX.Element {
                return (
                    <h1 data-source-line={dataSourceLine} id={headingId(children)}>
                        {children}
                    </h1>
                );
            },
            h2({ children, 'data-source-line': dataSourceLine }: HeadingProps): React.JSX.Element {
                return (
                    <h2 data-source-line={dataSourceLine} id={headingId(children)}>
                        {children}
                    </h2>
                );
            },
            h3({ children, 'data-source-line': dataSourceLine }: HeadingProps): React.JSX.Element {
                return (
                    <h3 data-source-line={dataSourceLine} id={headingId(children)}>
                        {children}
                    </h3>
                );
            },
            h4({ children, 'data-source-line': dataSourceLine }: HeadingProps): React.JSX.Element {
                return (
                    <h4 data-source-line={dataSourceLine} id={headingId(children)}>
                        {children}
                    </h4>
                );
            },
            h5({ children, 'data-source-line': dataSourceLine }: HeadingProps): React.JSX.Element {
                return (
                    <h5 data-source-line={dataSourceLine} id={headingId(children)}>
                        {children}
                    </h5>
                );
            },
            h6({ children, 'data-source-line': dataSourceLine }: HeadingProps): React.JSX.Element {
                return (
                    <h6 data-source-line={dataSourceLine} id={headingId(children)}>
                        {children}
                    </h6>
                );
            },
        };
    }, [documentId, documentPath, onActivateLink, imageSourceResolver]);

    return (
        <article className={`${styles.preview} gme-preview`}>
            <Markdown
                components={components}
                rehypePlugins={baseGfmRehypePlugins}
                remarkPlugins={baseGfmRemarkPlugins}
                skipHtml
                urlTransform={previewUrlTransform}
            >
                {source}
            </Markdown>
        </article>
    );
});

export default MarkdownView;
