import { memo } from 'react';
import Markdown from 'react-markdown';

import {
  baseGfmRehypePlugins,
  baseGfmRemarkPlugins,
  markdownComponents,
} from '../../logic/markdown/renderer';
import styles from './MarkdownView.module.css';

export interface MarkdownViewProps {
  source: string;
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
}: MarkdownViewProps): React.JSX.Element {
  return (
    <article className={`${styles.preview} gme-preview`}>
      <Markdown
        components={markdownComponents}
        rehypePlugins={baseGfmRehypePlugins}
        remarkPlugins={baseGfmRemarkPlugins}
        skipHtml
      >
        {source}
      </Markdown>
    </article>
  );
});

export default MarkdownView;
