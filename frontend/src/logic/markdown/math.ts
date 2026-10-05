import type { Root } from 'hast';
import rehypeKatex from 'rehype-katex';
import { collectMathScopes, mathSourceOf } from './renderLimits';

const options = {
    trust: false,
    strict: 'ignore',
    maxSize: 20,
    maxExpand: 200,
    output: 'html',
    errorColor: 'var(--err)',
} as const;

type KatexFile = Parameters<ReturnType<typeof rehypeKatex>>[1];

/** Keep KaTeX parse failures as one local source-bearing marker. */
export function rehypeMath(): (tree: Root, file: KatexFile) => void {
    const render = rehypeKatex(options);
    return (tree: Root, file: KatexFile): void => {
        const records = collectMathScopes(tree);

        const previousMessages = file.messages.length;
        render(tree, file);
        const failed = new Set(
            file.messages.slice(previousMessages).map((message) => {
                const ancestors = (message as typeof message & { ancestors?: unknown[] }).ancestors;
                return ancestors?.at(-1);
            }),
        );
        for (const record of records) {
            const sourceLine = record.scope.properties.dataSourceLine;
            if (failed.has(record.code)) {
                record.owner.children[record.index] = {
                    type: 'element',
                    tagName: 'span',
                    properties: {
                        className: ['katex-error', ...(record.display ? ['math-display-error'] : [])],
                        style: 'color:var(--err)',
                        ...(sourceLine !== undefined ? { dataSourceLine: sourceLine } : {}),
                    },
                    children: [{ type: 'text', value: mathSourceOf(record) }],
                };
            } else if (sourceLine !== undefined) {
                const rendered = record.owner.children[record.index];
                if (rendered?.type === 'element') rendered.properties.dataSourceLine = sourceLine;
            }
        }
    };
}
