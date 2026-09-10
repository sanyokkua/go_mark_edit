import {
  Children,
  isValidElement,
  memo,
  useState,
  type ReactNode,
} from 'react';
import Markdown from 'react-markdown';

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

function PreviewImage({
  alt,
  source,
  title,
}: PreviewImageProps): React.JSX.Element {
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

/*
 * Memoized on `source` because rendering it is not cheap and the pane above is
 * re-rendered for reasons that have nothing to do with the document.
 * `EditorView` passes `PreviewPane` an inline `onRefresh` arrow, so the pane
 * gets a fresh prop identity on every parent render, and without this the whole
 * GFM pipeline ran again each time.
 *
 * That is invisible on a small note and decisive at the size FR-FT-005 requires
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
  const activateLink = (href: string | undefined): void => {
    if (href === undefined || documentId === undefined) return;
    onActivateLink?.(documentId, classifyLink(href, documentPath));
  };

  return (
    <article className={`${styles.preview} gme-preview`}>
      <Markdown
        components={{
          ...markdownComponents,
          img({ alt, node: _node, src, title }): React.JSX.Element {
            void _node;
            const source =
              src === undefined ? undefined : imageSourceResolver?.(src);
            return <PreviewImage alt={alt} source={source} title={title} />;
          },
          a({
            children,
            href,
            node: _node,
            title,
            ...linkProps
          }): React.JSX.Element {
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
          h1({ children }): React.JSX.Element {
            return <h1 id={headingId(children)}>{children}</h1>;
          },
          h2({ children }): React.JSX.Element {
            return <h2 id={headingId(children)}>{children}</h2>;
          },
          h3({ children }): React.JSX.Element {
            return <h3 id={headingId(children)}>{children}</h3>;
          },
          h4({ children }): React.JSX.Element {
            return <h4 id={headingId(children)}>{children}</h4>;
          },
          h5({ children }): React.JSX.Element {
            return <h5 id={headingId(children)}>{children}</h5>;
          },
          h6({ children }): React.JSX.Element {
            return <h6 id={headingId(children)}>{children}</h6>;
          },
        }}
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
