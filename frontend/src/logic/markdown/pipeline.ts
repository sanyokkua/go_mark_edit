import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { PluggableList } from 'unified';

import { rehypeHeadingIds, remarkHeadings } from './headings';
import { rehypeCodeHighlight, rehypeHighlightGuard } from './highlight';
import { sanitizeSchema } from './sanitizeSchema';
import { rehypeRenderLimits } from './renderLimits';
import { rehypeMath } from './math';
import { rehypeSourceLines } from './sourceLines';
import { syntaxPlugins, type MarkdownStandard } from './syntax';
import { rehypeAlerts } from './syntax/alerts';

export { syntaxPlugins } from './syntax';
export type { MarkdownStandard } from './syntax';

export interface MarkdownPipeline {
    remarkPlugins: PluggableList;
    rehypePlugins: PluggableList;
}

const pipelineByStandard: Record<MarkdownStandard, MarkdownPipeline> = {
    minimal: makePipeline('minimal'),
    gfm: makePipeline('gfm'),
    full: makePipeline('full'),
};

function makePipeline(standard: MarkdownStandard): MarkdownPipeline {
    return {
        remarkPlugins: [...syntaxPlugins(standard), remarkHeadings],
        rehypePlugins: [
            rehypeRaw,
            rehypeSourceLines,
            [rehypeSanitize, sanitizeSchema],
            ...(standard === 'full' ? [rehypeRenderLimits] : []),
            rehypeHeadingIds,
            ...(standard === 'full' ? [rehypeAlerts] : []),
            ...(standard === 'full' ? [rehypeMath] : []),
            rehypeHighlightGuard,
            rehypeCodeHighlight,
        ],
    };
}

/** Stable plugin lists for react-markdown; it supplies both core parsers. */
export function createPipeline(standard: MarkdownStandard): MarkdownPipeline {
    return pipelineByStandard[standard];
}
