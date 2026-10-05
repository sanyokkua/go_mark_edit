import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { PluggableList } from 'unified';

import { rehypeHeadingIds, remarkHeadings } from './headings';
import { rehypeCodeHighlight, rehypeHighlightGuard } from './highlight';
import { sanitizeSchema } from './sanitizeSchema';
import { rehypeRenderLimits } from './renderLimits';
import { rehypeMath } from './math';
import { rehypeSourceLines } from './sourceLines';
import { rehypeCaptureOriginalLinkTargets } from './renderer';
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

const prosePipelineByStandard = {
    gfm: withoutGfm(pipelineByStandard.gfm),
    full: withoutGfm(pipelineByStandard.full),
};

function withoutGfm(pipeline: MarkdownPipeline): MarkdownPipeline {
    return {
        ...pipeline,
        remarkPlugins: pipeline.remarkPlugins.filter((plugin) => plugin !== remarkGfm),
    };
}

function makePipeline(standard: MarkdownStandard): MarkdownPipeline {
    return {
        remarkPlugins: [...syntaxPlugins(standard), remarkHeadings],
        rehypePlugins: [
            rehypeRaw,
            rehypeCaptureOriginalLinkTargets,
            rehypeSourceLines,
            [rehypeSanitize, sanitizeSchema],
            [rehypeRenderLimits, { math: standard === 'full' }],
            rehypeHeadingIds,
            ...(standard === 'full' ? [rehypeAlerts] : []),
            ...(standard === 'full' ? [rehypeMath] : []),
            rehypeHighlightGuard,
            rehypeCodeHighlight,
        ],
    };
}

/** Stable plugin lists for react-markdown; it supplies both core parsers. */
export function createPipeline(standard: MarkdownStandard, source?: string): MarkdownPipeline {
    // GFM tables require a pipe or colon; its other constructs need these markers.
    // Entities, escapes and HTML can produce autolinks after decoding, so keep GFM
    // for any such source rather than attempting to parse it in this preflight.
    // Task markers can span normalized line endings, so check only their opener.
    if (standard !== 'minimal' && source !== undefined && !/[|~@:<&\\]|www\.|\[\^|\[[\sxX]/i.test(source)) {
        return prosePipelineByStandard[standard];
    }
    return pipelineByStandard[standard];
}
