import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import type { PluggableList } from 'unified';

import { remarkContainerSyntax, remarkContainers } from './syntax/containers';
import { remarkMathStrict } from './syntax/mathStrict';

export type MarkdownStandard = 'minimal' | 'gfm' | 'full';

const syntaxByStandard: Record<MarkdownStandard, PluggableList> = {
    minimal: [],
    gfm: [remarkGfm, [remarkFrontmatter, ['yaml']]],
    full: [remarkGfm, [remarkFrontmatter, ['yaml']], remarkMathStrict, remarkContainerSyntax, remarkContainers],
};

/** Syntax-only plugins also serve the tidy parser and editor link provider. */
export function syntaxPlugins(standard: MarkdownStandard): PluggableList {
    return syntaxByStandard[standard];
}
