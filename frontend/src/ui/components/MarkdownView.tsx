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

const MarkdownView: React.FC<MarkdownViewProps> = ({
  source,
}: MarkdownViewProps): React.JSX.Element => (
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

export default MarkdownView;
