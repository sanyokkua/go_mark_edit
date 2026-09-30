import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { PluggableList } from 'unified';

import { rehypeHeadingIds, remarkHeadings } from './headings';
import { sanitizeSchema } from './sanitizeSchema';
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
        // Later render limits, alerts, math and highlighting follow
        // this sanitizer in that order as their respective features are added.
        rehypePlugins: [
            rehypeRaw,
            rehypeSourceLines,
            [rehypeSanitize, sanitizeSchema],
            rehypeHeadingIds,
            ...(standard === 'full' ? [rehypeAlerts] : []),
        ],
    };
}

/** Stable plugin lists for react-markdown; it supplies both core parsers. */
export function createPipeline(standard: MarkdownStandard): MarkdownPipeline {
    return pipelineByStandard[standard];
}
