const forbidden = new Set(['script', 'foreignobject', 'img', 'image', 'use']);
const urlPattern = /url\s*\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/gi;
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
    return value
        .replace(/\/\*[\s\S]*?\*\//g, '')
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
    return value.replace(
        urlPattern,
        (_match, _quote, quoted: string | undefined, bare: string | undefined) =>
            `url(${(quoted ?? bare ?? '').trim()})`,
    );
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
    const withUrls = css.replace(
        urlPattern,
        (match, _quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
            const target = (quoted ?? bare ?? '').trim();
            return target.startsWith('#') && ids.has(target.slice(1)) ? `url(#${ids.get(target.slice(1))})` : match;
        },
    );
    const sortedIds = [...ids.keys()].sort((a, b) => b.length - a.length);
    return withUrls.replace(/([^{}]+)\{/g, (match, selector: string) => {
        if (selector.trimStart().startsWith('@')) return match;
        let rewritten = selector;
        for (const old of sortedIds) {
            rewritten = rewritten.replace(
                new RegExp(`#${escapePattern(old)}(?![A-Za-z0-9_-])`, 'g'),
                `#${ids.get(old)}`,
            );
        }
        return `${rewritten}{`;
    });
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
                attribute.value = attribute.value.replace(
                    urlPattern,
                    (match, _quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
                        const target = (quoted ?? bare ?? '').trim();
                        return target.startsWith('#') && ids.has(target.slice(1))
                            ? `url(#${ids.get(target.slice(1))})`
                            : match;
                    },
                );
            }
        }
    }
    return new XMLSerializer().serializeToString(documentRef.documentElement);
}
