const forbidden = new Set(['script', 'foreignobject', 'img', 'image', 'use']);
const safeFunctions = new Set([
    'rgb',
    'rgba',
    'hsl',
    'hsla',
    'lab',
    'lch',
    'oklab',
    'oklch',
    'calc',
    'min',
    'max',
    'clamp',
    'translate',
    'translatex',
    'translatey',
    'scale',
    'scalex',
    'scaley',
    'rotate',
    'skew',
    'matrix',
    'matrix3d',
    'cubic-bezier',
    'steps',
    'blur',
    'drop-shadow',
    'linear-gradient',
    'radial-gradient',
    'conic-gradient',
    'repeating-linear-gradient',
    'repeating-radial-gradient',
    'repeating-conic-gradient',
]);

function decodeCssEscapes(value: string): string {
    const parts: string[] = [];
    let cursor = 0;
    while (true) {
        const open = value.indexOf('/*', cursor);
        if (open < 0) break;
        const close = value.indexOf('*/', open + 2);
        if (close < 0) break;
        parts.push(value.slice(cursor, open));
        cursor = close + 2;
    }
    parts.push(value.slice(cursor));
    return parts
        .join('')
        .replace(
            /\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\n\f\r])/gi,
            (_match, hex: string | undefined, escaped: string | undefined) => {
                if (hex) {
                    const point = Number.parseInt(hex, 16);
                    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd';
                }
                return escaped ?? '';
            },
        );
}

function parseSvg(svg: string): Document {
    const documentRef = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (documentRef.querySelector('parsererror') || documentRef.documentElement.localName !== 'svg') {
        throw new Error('Invalid Mermaid SVG output');
    }
    return documentRef;
}

/** Reject a whole declaration when a function can load a resource. */
function safeCssValue(value: string): boolean {
    let quote = '';
    let depth = 0;
    for (let index = 0; index < value.length; index++) {
        const character = value[index];
        if (quote) {
            if (character === '\n' || character === '\r' || character === '\f') return false;
            if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (/[a-z_-]/i.test(character)) {
            const start = index;
            while (index < value.length && /[a-z0-9_-]/i.test(value[index])) index++;
            const name = value.slice(start, index).toLowerCase();
            while (index < value.length && /\s/.test(value[index])) index++;
            if (value[index] !== '(') {
                index--;
                continue;
            }
            if (name === 'url') {
                const close = value.indexOf(')', index + 1);
                if (close < 0) return false;
                const target = value
                    .slice(index + 1, close)
                    .trim()
                    .replace(/^(['"])(.*)\1$/s, '$2');
                if (!/^#[^\s"'()<>]+$/.test(target)) return false;
                index = close;
                continue;
            }
            if (!safeFunctions.has(name)) return false;
            depth++;
            continue;
        }
        if (character === '(') depth++;
        if (character === ')') {
            depth -= 1;
            if (depth < 0) return false;
        }
    }
    return quote === '' && depth === 0;
}

function safeDeclaration(segment: string): string {
    const colon = segment.indexOf(':');
    if (colon < 0) return '';
    const property = segment.slice(0, colon).trim();
    if (!/^-?[a-z][a-z0-9-]*$/i.test(property) || property.startsWith('--')) return '';
    const value = segment.slice(colon + 1);
    return safeCssValue(value) ? segment.slice(0, colon + 1) + canonicalLocalUrls(value) : '';
}

function canonicalLocalUrls(value: string): string {
    return rewriteCssUrls(value, (target) => `url(${target})`);
}

type CssQuote = "'" | '"';
type CssUrlIndex = {
    closings: Record<CssQuote, number[]>;
    lineEnds: number[];
    positions: Record<CssQuote, number>;
    linePosition: number;
};

function indexCssUrls(value: string): CssUrlIndex {
    const closings: Record<CssQuote, number[]> = { "'": [], '"': [] };
    const lineEnds: number[] = [];
    for (let index = 0; index < value.length; index++) {
        const character = value[index];
        if (character === '\n' || character === '\r' || character === '\u2028' || character === '\u2029') {
            lineEnds.push(index);
        }
        if (character !== "'" && character !== '"') continue;
        let after = index + 1;
        while (after < value.length && /\s/.test(value[after])) after++;
        if (value[after] === ')') closings[character].push(index);
    }
    return { closings, lineEnds, positions: { "'": 0, '"': 0 }, linePosition: 0 };
}

function quotedCssUrlEnd(index: CssUrlIndex, quote: CssQuote, content: number): number | undefined {
    const candidates = index.closings[quote];
    while (index.positions[quote] < candidates.length && candidates[index.positions[quote]] <= content) {
        index.positions[quote]++;
    }
    while (index.linePosition < index.lineEnds.length && index.lineEnds[index.linePosition] <= content) {
        index.linePosition++;
    }
    const close = candidates[index.positions[quote]];
    return close !== undefined &&
        (index.linePosition === index.lineEnds.length || close < index.lineEnds[index.linePosition])
        ? close
        : undefined;
}

/** Match the existing URL syntax without repeatedly scanning malformed suffixes. */
function rewriteCssUrls(value: string, replace: (target: string, original: string) => string): string {
    const index = indexCssUrls(value);
    const prefix = /url\s*\(\s*/gi;
    const parts: string[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = prefix.exec(value))) {
        const content = prefix.lastIndex;
        const bareEnd = value.indexOf(')', content);
        if (bareEnd < 0) break;
        let end = bareEnd;
        let target = value.slice(content, end);
        const quote = value[content];
        if (quote === "'" || quote === '"') {
            const close = quotedCssUrlEnd(index, quote, content);
            if (close !== undefined) {
                target = value.slice(content + 1, close);
                end = value.indexOf(')', close + 1);
            }
        }
        const original = value.slice(match.index, end + 1);
        parts.push(value.slice(cursor, match.index), replace(target.trim(), original));
        cursor = end + 1;
        prefix.lastIndex = cursor;
    }
    parts.push(value.slice(cursor));
    return parts.join('');
}

function sanitizeCss(css: string, stylesheet: boolean): string {
    const normalized = decodeCssEscapes(css);
    const output: string[] = [];
    const blocks: Array<'rule' | 'at' | 'drop'> = [];
    let quote = '';
    let depth = 0;
    let start = 0;
    for (let index = 0; index < normalized.length; index++) {
        const character = normalized[index];
        if (quote) {
            if (character === '\n' || character === '\r' || character === '\f') return '';
            if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '(') depth++;
        if (character === ')') depth--;
        if (depth !== 0) continue;
        if (stylesheet && character === '{') {
            const selector = normalized.slice(start, index);
            const atRule = selector.trim().startsWith('@');
            const allowedAtRule = /^@(?:-webkit-)?keyframes\b|^@(?:media|supports)\b/i.test(selector.trim());
            const kind = blocks.at(-1) === 'drop' || (atRule && !allowedAtRule) ? 'drop' : atRule ? 'at' : 'rule';
            blocks.push(kind);
            if (kind !== 'drop') output.push(selector, '{');
            start = index + 1;
        } else if (character === ';' || (stylesheet && character === '}')) {
            const segment = normalized.slice(start, index);
            if ((stylesheet ? blocks.at(-1) === 'rule' : true) && blocks.at(-1) !== 'drop') {
                const safe = safeDeclaration(segment);
                if (safe) output.push(safe, ';');
            }
            if (character === '}') {
                if (blocks.pop() !== 'drop') output.push('}');
            }
            start = index + 1;
        }
    }
    if (!stylesheet && quote === '' && depth === 0) {
        const safe = safeDeclaration(normalized.slice(start));
        if (safe) output.push(safe);
    }
    return output.join('');
}

/** Keep Mermaid's geometry and local styles but remove execution and external loads. */
export function scrubMermaidSvg(svg: string): string {
    const documentRef = parseSvg(svg);
    for (const element of [...documentRef.querySelectorAll('*')]) {
        if (forbidden.has(element.localName.toLowerCase())) {
            element.remove();
            continue;
        }
        if (element.localName.toLowerCase() === 'style') {
            element.textContent = sanitizeCss(element.textContent ?? '', true);
        }
        for (const attribute of [...element.attributes]) {
            const name = attribute.localName.toLowerCase();
            if (name.startsWith('on')) {
                element.removeAttributeNode(attribute);
            } else if (name === 'href') {
                if (element.localName.toLowerCase() === 'a' || !attribute.value.trim().startsWith('#')) {
                    element.removeAttributeNode(attribute);
                }
            } else if (name === 'style') {
                attribute.value = sanitizeCss(attribute.value, false);
            } else if (name !== 'id' && (attribute.value.includes('(') || attribute.value.includes('\\'))) {
                const value = decodeCssEscapes(attribute.value);
                if (safeCssValue(value)) attribute.value = canonicalLocalUrls(value);
                else element.removeAttributeNode(attribute);
            }
        }
    }
    return new XMLSerializer().serializeToString(documentRef.documentElement);
}

function escapePattern(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namespaceCss(css: string, ids: Map<string, string>): string {
    const withUrls = rewriteCssUrls(css, (target, match) =>
        target.startsWith('#') && ids.has(target.slice(1)) ? `url(#${ids.get(target.slice(1))})` : match,
    );
    const sortedIds = [...ids.keys()].sort((a, b) => b.length - a.length);
    const parts: string[] = [];
    let start = 0;
    for (let index = 0; index < withUrls.length; index++) {
        if (withUrls[index] !== '{' && withUrls[index] !== '}') continue;
        const selector = withUrls.slice(start, index);
        let rewritten = selector;
        if (withUrls[index] === '{' && !selector.trimStart().startsWith('@')) {
            for (const old of sortedIds) {
                rewritten = rewritten.replace(
                    new RegExp(`#${escapePattern(old)}(?![A-Za-z0-9_-])`, 'g'),
                    `#${ids.get(old)}`,
                );
            }
        }
        parts.push(rewritten, withUrls[index]);
        start = index + 1;
    }
    parts.push(withUrls.slice(start));
    return parts.join('');
}

/** Cached SVG needs fresh IDs when identical diagrams appear more than once. */
export function namespaceMermaidSvg(svg: string, namespace: string): string {
    const documentRef = parseSvg(svg);
    const prefix = namespace.replace(/[^A-Za-z0-9_-]/g, '-') || 'diagram';
    const ids = new Map<string, string>();
    for (const element of documentRef.querySelectorAll('[id]')) {
        const oldId = element.getAttribute('id')!;
        ids.set(oldId, `${prefix}-${oldId}`);
    }
    for (const element of documentRef.querySelectorAll('*')) {
        const oldId = element.getAttribute('id');
        if (oldId) element.setAttribute('id', ids.get(oldId)!);
        if (element.localName.toLowerCase() === 'style') {
            element.textContent = namespaceCss(element.textContent ?? '', ids);
        }
        for (const attribute of [...element.attributes]) {
            if (attribute.localName === 'id') continue;
            if (attribute.localName === 'href' && attribute.value.startsWith('#')) {
                attribute.value = `#${ids.get(attribute.value.slice(1)) ?? attribute.value.slice(1)}`;
            } else if (attribute.localName === 'aria-labelledby' || attribute.localName === 'aria-describedby') {
                attribute.value = attribute.value
                    .split(/\s+/)
                    .map((id) => ids.get(id) ?? id)
                    .join(' ');
            } else {
                attribute.value = rewriteCssUrls(attribute.value, (target, match) =>
                    target.startsWith('#') && ids.has(target.slice(1)) ? `url(#${ids.get(target.slice(1))})` : match,
                );
            }
        }
    }
    return new XMLSerializer().serializeToString(documentRef.documentElement);
}
