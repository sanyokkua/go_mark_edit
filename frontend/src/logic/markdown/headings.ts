import GithubSlugger from 'github-slugger';
import type { Element, Root as HastRoot } from 'hast';
import type { Heading as MdastHeading, Root as MdastRoot } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { syntaxPlugins } from './syntax';

export interface Heading {
    depth: number;
    text: string;
    slug: string;
    line: number;
}

function collectHeadings(tree: MdastRoot): { headings: Heading[]; columns: number[] } {
    const headings: Heading[] = [];
    const columns: number[] = [];
    const slugger = new GithubSlugger();
    visit(tree, 'heading', (node: MdastHeading): void => {
        if (node.position === undefined) return;
        const text = toString(node, { includeImageAlt: false, includeHtml: false });
        headings.push({ depth: node.depth, text, slug: slugger.slug(text), line: node.position.start.line });
        columns.push(node.position.start.column);
    });
    return { headings, columns };
}

/** Extracts the same Markdown heading model used by the preview pipeline. */
export function extractHeadings(source: string): Heading[] {
    const parser = unified().use(remarkParse).use(syntaxPlugins('full'));
    return collectHeadings(parser.runSync(parser.parse(source)) as MdastRoot).headings;
}

export function headingAnchor(headings: Heading[], slug: string): Heading | undefined {
    return headings.find((heading) => heading.slug === slug);
}

/** The remark parser has already applied the selected Markdown syntax. */
export function remarkHeadings(): (tree: MdastRoot, file: { data: Record<string, unknown> }) => void {
    return (tree, file): void => {
        const collected = collectHeadings(tree);
        file.data.headings = collected.headings;
        file.data.headingColumns = collected.columns;
    };
}

/** Assigns ids only where a rendered heading starts at the Markdown heading's source position. */
export function rehypeHeadingIds(): (tree: HastRoot, file: { data: Record<string, unknown> }) => void {
    return (tree, file): void => {
        const headings = file.data.headings as Heading[] | undefined;
        const columns = file.data.headingColumns as number[] | undefined;
        if (headings === undefined || columns === undefined) return;
        const byPosition = new Map(
            headings.map((heading, index) => [`${heading.line}:${columns[index]}:${heading.depth}`, heading]),
        );
        visit(tree, 'element', (node: Element): void => {
            if (!/^h[1-6]$/.test(node.tagName) || node.position === undefined) return;
            const heading = byPosition.get(
                `${node.position.start.line}:${node.position.start.column}:${node.tagName[1]}`,
            );
            if (heading !== undefined) node.properties.id = heading.slug;
        });
    };
}

/** Finds the first exact id inside the preview, including author-supplied raw ids. */
export function scrollToAnchor(container: HTMLElement, slug: string): boolean {
    for (const element of container.querySelectorAll<HTMLElement>('[id]')) {
        if (element.id === slug) {
            element.scrollIntoView?.({ block: 'start' });
            return true;
        }
    }
    return false;
}
