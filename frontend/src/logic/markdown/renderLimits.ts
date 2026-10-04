import type { Element, Root, RootContent } from 'hast';
import { toText } from 'hast-util-to-text';

const maxFormulas = 1_000;
const maxFormulaCharacters = 10_000;

type Parent = Root | Element;

export interface MathScope {
    code: Element;
    scope: Element;
    owner: Parent;
    index: number;
    display: boolean;
}

function isMathCode(node: RootContent): boolean {
    return (
        node.type === 'element' &&
        node.tagName === 'code' &&
        Array.isArray(node.properties.className) &&
        node.properties.className.includes('language-math')
    );
}

/** A raw pre can contain several math codes; KaTeX would revisit its detached node. */
function normalizeMathPre(tree: Root): void {
    const pending: Parent[] = [tree];
    let parent = pending.pop();
    while (parent !== undefined) {
        for (const child of parent.children) {
            if (child.type !== 'element') continue;
            if (child.tagName === 'pre' && child.children.some(isMathCode)) {
                if (child.children.length !== 1 || !isMathCode(child.children[0])) {
                    const source = toText(child, { whitespace: 'pre' });
                    child.children = [
                        {
                            type: 'element',
                            tagName: 'code',
                            properties: { className: ['language-math'] },
                            children: [{ type: 'text', value: source }],
                        },
                    ];
                }
            } else {
                pending.push(child);
            }
        }
        parent = pending.pop();
    }
}

/** Match rehype-katex's immediate-pre scope and its preorder traversal. */
export function collectMathScopes(tree: Root, numberMermaid = false): MathScope[] {
    const records: MathScope[] = [];
    const seenScopes = new WeakSet<Element>();
    let diagrams = 0;
    const pending: Array<{ parent: Parent; index: number; parentOwner?: { parent: Parent; index: number } }> = [];
    for (let index = tree.children.length - 1; index >= 0; index--) pending.push({ parent: tree, index });

    let item = pending.pop();
    while (item !== undefined) {
        const { parent, index, parentOwner } = item;
        const child = parent.children[index];
        if (child.type === 'element') {
            if (
                numberMermaid &&
                child.tagName === 'code' &&
                parent.type === 'element' &&
                parent.tagName === 'pre' &&
                Array.isArray(child.properties.className) &&
                child.properties.className.includes('language-mermaid')
            ) {
                child.properties.dataMermaidIndex = ++diagrams;
            }
            if (isMathCode(child)) {
                const display = parent.type === 'element' && parent.tagName === 'pre';
                const scope = display ? parent : child;
                if (!seenScopes.has(scope)) {
                    seenScopes.add(scope);
                    records.push({
                        code: child,
                        scope,
                        owner: display ? parentOwner!.parent : parent,
                        index: display ? parentOwner!.index : index,
                        display,
                    });
                }
            } else {
                for (let childIndex = child.children.length - 1; childIndex >= 0; childIndex--) {
                    pending.push({ parent: child, index: childIndex, parentOwner: { parent, index } });
                }
            }
        }
        item = pending.pop();
    }
    return records;
}

export function hasGeneratedFenceLineFeed(code: Element, scope: Element): boolean {
    const codeStart = code.position?.start.offset;
    const codeEnd = code.position?.end.offset;
    return (
        codeStart !== undefined &&
        codeEnd !== undefined &&
        codeStart === scope.position?.start.offset &&
        codeEnd === scope.position?.end.offset
    );
}

/** Source seen by KaTeX, minus the one LF remark-rehype adds to a fence. */
export function mathSourceOf(record: MathScope): string {
    const renderedSource = toText(record.scope, { whitespace: 'pre' });
    return record.display && hasGeneratedFenceLineFeed(record.code, record.scope) && renderedSource.endsWith('\n')
        ? renderedSource.slice(0, -1)
        : renderedSource;
}

/** Count sanitized formulas in document order before KaTeX can expand them. */
export function rehypeRenderLimits(options: { math: boolean }): (tree: Root) => void {
    return (tree: Root): void => {
        if (options.math) normalizeMathPre(tree);
        let formulas = 0;
        for (const record of collectMathScopes(tree, true)) {
            if (!options.math) continue;
            formulas++;
            const reason =
                formulas > maxFormulas
                    ? 'too-many'
                    : mathSourceOf(record).length > maxFormulaCharacters
                      ? 'too-large'
                      : null;
            if (reason === null) continue;
            const sourceLine = record.scope.properties.dataSourceLine;
            record.owner.children[record.index] = {
                type: 'element',
                tagName: record.display ? 'div' : 'span',
                properties: {
                    dataMathLimit: reason,
                    ...(sourceLine !== undefined ? { dataSourceLine: sourceLine } : {}),
                },
                children: [],
            };
        }
    };
}
