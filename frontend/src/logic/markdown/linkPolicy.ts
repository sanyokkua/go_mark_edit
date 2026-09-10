const acceptedDocumentExtensions = new Set([
  '.md',
  '.markdown',
  '.mdown',
  '.txt',
]);

export type LinkRefusalReason =
  | 'empty'
  | 'scheme'
  | 'malformed'
  | 'untitled-document'
  | 'outside-document-folder'
  | 'unsupported-extension';

export type LinkTarget =
  | { kind: 'anchor'; href: string; fragment: string }
  | { kind: 'localDocument'; href: string; path: string }
  | { kind: 'external'; href: string }
  | { kind: 'refused'; href: string; reason: LinkRefusalReason };

function refused(href: string, reason: LinkRefusalReason): LinkTarget {
  return { kind: 'refused', href, reason };
}

function hasExplicitScheme(href: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(href);
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

function extension(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1);
  const dot = basename.lastIndexOf('.');
  return dot < 0 ? '' : basename.slice(dot).toLowerCase();
}

function localPath(href: string, documentPath: string): string | undefined {
  const queryStart = href.search(/[?#]/);
  const pathPart = queryStart < 0 ? href : href.slice(0, queryStart);
  const decoded = decodePath(pathPart);
  if (decoded === undefined || decoded === '') return undefined;

  const folderEnd = documentPath.lastIndexOf('/');
  const folder = folderEnd < 0 ? '' : documentPath.slice(0, folderEnd);
  return normalizePath(
    decoded.startsWith('/') ? decoded : `${folder}/${decoded}`,
  );
}

function isInsideFolder(path: string, documentPath: string): boolean {
  const folderEnd = documentPath.lastIndexOf('/');
  const folder = folderEnd < 0 ? '' : documentPath.slice(0, folderEnd);
  return path !== folder && path.startsWith(`${folder}/`);
}

export function classifyLink(href: string, documentPath?: string): LinkTarget {
  const trimmed = href.trim();
  if (trimmed === '') return refused(href, 'empty');

  if (trimmed.startsWith('#')) {
    return { kind: 'anchor', href, fragment: trimmed.slice(1) };
  }

  if (hasExplicitScheme(trimmed)) {
    const scheme = trimmed.slice(0, trimmed.indexOf(':')).toLowerCase();
    if (scheme === 'http' || scheme === 'https') {
      return { kind: 'external', href };
    }
    return refused(href, 'scheme');
  }

  if (trimmed.startsWith('//')) return refused(href, 'scheme');
  if (documentPath === undefined || documentPath === '') {
    return refused(href, 'untitled-document');
  }

  const path = localPath(trimmed, documentPath);
  if (path === undefined) return refused(href, 'malformed');
  if (!isInsideFolder(path, documentPath)) {
    return refused(href, 'outside-document-folder');
  }
  if (!acceptedDocumentExtensions.has(extension(path))) {
    return refused(href, 'unsupported-extension');
  }

  return { kind: 'localDocument', href, path };
}
