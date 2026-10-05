import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { syntaxPlugins } from '../markdown/syntax';

const parser = unified().use(remarkParse).use(syntaxPlugins('full'));

/** Run Full syntax transforms as well as parsing, including container rewriting. */
export function parseFull(source: string): Root {
    return parser.runSync(parser.parse(source), { value: source }) as Root;
}
