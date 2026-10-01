const forbidden = new Set(['script', 'foreignobject', 'img', 'image', 'use']);
const urlPattern = /url\s*\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/gi;

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

function localUrlOnly(value: string): string {
    return value.replace(
        urlPattern,
        (_match, _quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
            const target = (quoted ?? bare ?? '').trim();
            return /^#[^\s"'()<>]+$/.test(target) ? `url(${target})` : 'none';
        },
    );
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
            const css = decodeCssEscapes(element.textContent ?? '');
            element.textContent = localUrlOnly(css.replace(/@import[^;{}]*(?:;|$)/gi, ''));
        }
        for (const attribute of [...element.attributes]) {
            const name = attribute.localName.toLowerCase();
            if (name.startsWith('on')) {
                element.removeAttributeNode(attribute);
            } else if (name === 'href') {
                if (element.localName.toLowerCase() === 'a' || !attribute.value.trim().startsWith('#')) {
                    element.removeAttributeNode(attribute);
                }
            } else if (name !== 'id' && (/url\s*\(/i.test(attribute.value) || attribute.value.includes('\\'))) {
                attribute.value = localUrlOnly(decodeCssEscapes(attribute.value));
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
