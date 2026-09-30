import rehypeHighlight from 'rehype-highlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import go from 'highlight.js/lib/languages/go';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import ini from 'highlight.js/lib/languages/ini';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import bash from 'highlight.js/lib/languages/bash';
import powershell from 'highlight.js/lib/languages/powershell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import makefile from 'highlight.js/lib/languages/makefile';
import diff from 'highlight.js/lib/languages/diff';
import markdown from 'highlight.js/lib/languages/markdown';
import type { Element, ElementContent, Root } from 'hast';
import { visit } from 'unist-util-visit';
import type { Pluggable } from 'unified';

const languages = {
    javascript,
    typescript,
    go,
    python,
    java,
    c,
    cpp,
    csharp,
    rust,
    ruby,
    php,
    kotlin,
    swift,
    sql,
    json,
    yaml,
    ini,
    xml,
    css,
    scss,
    bash,
    powershell,
    dockerfile,
    makefile,
    diff,
    markdown,
};
const aliases = {
    javascript: ['jsx'],
    typescript: ['tsx'],
    bash: ['sh', 'shell', 'zsh', 'console'],
    ini: ['toml'],
    xml: ['html'],
    markdown: ['md'],
    csharp: ['cs'],
    rust: ['rs'],
    kotlin: ['kt'],
    dockerfile: ['docker'],
    diff: ['patch'],
    makefile: ['make', 'mk'],
    json: ['jsonc'],
    scss: ['sass'],
};
const supported = new Set([...Object.keys(languages), ...Object.values(aliases).flat()]);
const maxSourceCharacters = 200000;

function textOf(node: ElementContent): string {
    if (node.type === 'text') return node.value;
    if ('children' in node) return node.children.map(textOf).join('');
    return '';
}

/** Guard code blocks after sanitization, before rehype-highlight. */
export function rehypeHighlightGuard(): (tree: Root) => void {
    return (tree: Root): void =>
        visit(tree, 'element', (node, _index, parent) => {
            if (node.tagName !== 'code' || parent?.type !== 'element' || parent.tagName !== 'pre') return;
            const code = node as Element;
            const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
            const language = classes
                .find((value) => typeof value === 'string' && value.startsWith('language-'))
                ?.slice('language-'.length);
            const renderedText = code.children.map(textOf).join('');
            // remark-rehype appends one LF to fenced code; it is not in mdast code.value.
            const sourceLength = renderedText.length - Number(renderedText.endsWith('\n'));
            if (
                !language ||
                (!supported.has(language) && language !== 'mermaid') ||
                sourceLength > maxSourceCharacters
            ) {
                code.properties.className = [...classes, 'no-highlight'];
            }
        });
}

export const rehypeCodeHighlight: Pluggable = [
    rehypeHighlight,
    {
        languages,
        aliases,
        detect: false,
        plainText: ['mermaid'],
    },
];
