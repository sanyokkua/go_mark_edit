import { lazy } from 'react';

/** The renderer chunk, loaded on first use and shared by the preview and the print copy. */
const LazyMarkdownView = lazy(() => import('../components/MarkdownView'));

export default LazyMarkdownView;
