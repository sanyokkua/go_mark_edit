import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import type { PluggableList } from 'unified';

import { sanitizeSchema } from './sanitizeSchema';
import { rehypeSourceLines } from './sourceLines';

export type MarkdownStandard = 'minimal' | 'gfm' | 'full';

export interface MarkdownPipeline {
    remarkPlugins: PluggableList;
    rehypePlugins: PluggableList;
}

const syntaxByStandard: Record<MarkdownStandard, PluggableList> = {
    minimal: [],
    gfm: [remarkGfm, [remarkFrontmatter, ['yaml']]],
    full: [remarkGfm, [remarkFrontmatter, ['yaml']]],
};

/** Syntax-only plugins also serve the tidy parser and editor link provider. */
export function syntaxPlugins(standard: MarkdownStandard): PluggableList {
    return syntaxByStandard[standard];
}

const pipelineByStandard: Record<MarkdownStandard, MarkdownPipeline> = {
    minimal: makePipeline('minimal'),
    gfm: makePipeline('gfm'),
    full: makePipeline('full'),
};

function makePipeline(standard: MarkdownStandard): MarkdownPipeline {
    return {
        remarkPlugins: syntaxPlugins(standard),
        // Later render limits, heading ids, alerts, math and highlighting follow
        // this sanitizer in that order as their respective features are added.
        rehypePlugins: [rehypeRaw, rehypeSourceLines, [rehypeSanitize, sanitizeSchema]],
    };
}

/** Stable plugin lists for react-markdown; it supplies both core parsers. */
export function createPipeline(standard: MarkdownStandard): MarkdownPipeline {
    return pipelineByStandard[standard];
}
