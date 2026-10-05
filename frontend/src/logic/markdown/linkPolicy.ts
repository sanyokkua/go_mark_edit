export type LinkRefusalReason = 'empty' | 'scheme' | 'malformed' | 'untitled-document' | 'network-path';

export type LinkTarget =
    | { kind: 'anchor'; href: string; fragment: string }
    | { kind: 'localDocument'; href: string; fragment?: string }
    | { kind: 'external'; href: string }
    | { kind: 'refused'; href: string; reason: LinkRefusalReason };

function refused(href: string, reason: LinkRefusalReason): LinkTarget {
    return { kind: 'refused', href, reason };
}

function hasExplicitScheme(href: string): boolean {
    return /^[a-z][a-z\d+.-]*:/i.test(href) && !/^[a-z]:/i.test(href);
}

function decodePath(href: string): string | undefined {
    try {
        return decodeURIComponent(href);
    } catch {
        return undefined;
    }
}

function normalizePath(path: string): string {
    const absolute = path.startsWith('/');
    const parts: string[] = [];

    for (const part of path.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') {
            if (parts.length > 0 && parts.at(-1) !== '..') {
                parts.pop();
            } else if (!absolute) {
                parts.push(part);
            }
            continue;
        }
        parts.push(part);
    }

    return `${absolute ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.');
}

export function resolveLocalPath(href: string, documentPath: string): string | undefined {
    const queryStart = href.search(/[?#]/);
    const pathPart = queryStart < 0 ? href : href.slice(0, queryStart);
    const decoded = decodePath(pathPart);
    if (decoded === undefined || decoded === '') return undefined;

    const folderEnd = documentPath.lastIndexOf('/');
    const folder = folderEnd < 0 ? '' : documentPath.slice(0, folderEnd);
    return normalizePath(decoded.startsWith('/') ? decoded : `${folder}/${decoded}`);
}

export function isInsideDocumentFolder(path: string, documentPath: string): boolean {
    const folderEnd = documentPath.lastIndexOf('/');
    const folder = folderEnd < 0 ? '' : documentPath.slice(0, folderEnd);
    return path !== folder && path.startsWith(`${folder}/`);
}

export function classifyLink(href: string, documentPath?: string): LinkTarget {
    const trimmed = href.trim();
    if (trimmed === '') return refused(href, 'empty');

    if (trimmed.startsWith('#')) {
        const fragment = decodePath(trimmed.slice(1));
        return fragment === undefined ? refused(href, 'malformed') : { kind: 'anchor', href, fragment };
    }

    if (hasExplicitScheme(trimmed)) {
        const scheme = trimmed.slice(0, trimmed.indexOf(':')).toLowerCase();
        if (scheme === 'http' || scheme === 'https') {
            return { kind: 'external', href };
        }
        return refused(href, 'scheme');
    }

    const fragmentStart = trimmed.indexOf('#');
    const pathAndQuery = fragmentStart < 0 ? trimmed : trimmed.slice(0, fragmentStart);
    const queryStart = pathAndQuery.indexOf('?');
    const path = decodePath(queryStart < 0 ? pathAndQuery : pathAndQuery.slice(0, queryStart));
    const fragment = fragmentStart < 0 ? undefined : decodePath(trimmed.slice(fragmentStart + 1));
    if (path === undefined || path === '' || (fragmentStart >= 0 && fragment === undefined)) {
        return refused(href, 'malformed');
    }
    if (/^[\\/]{2}/u.test(path)) return refused(href, 'network-path');
    if (documentPath === undefined || documentPath === '') {
        if (!path.startsWith('/') && !path.startsWith('\\') && !/^[a-z]:[\\/]/iu.test(path)) {
            return refused(href, 'untitled-document');
        }
    }

    return fragment === undefined ? { kind: 'localDocument', href } : { kind: 'localDocument', href, fragment };
}
