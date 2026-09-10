import { isInsideDocumentFolder, resolveLocalPath } from './linkPolicy';

export type ImagePlaceholderReason =
  | 'empty'
  | 'scheme'
  | 'malformed'
  | 'untitled-document'
  | 'absolute-path'
  | 'outside-document-folder';

export type ImageSource =
  | { kind: 'local'; path: string; source: string }
  | { kind: 'placeholder'; reason: ImagePlaceholderReason; source: string };

function hasExplicitScheme(source: string): boolean {
  return /^[a-z][a-z\d+.-]*:/iu.test(source);
}

export function classifyImageSource(
  source: string,
  documentPath?: string,
): ImageSource {
  const trimmed = source.trim();
  if (trimmed === '') {
    return { kind: 'placeholder', reason: 'empty', source };
  }
  if (hasExplicitScheme(trimmed) || trimmed.startsWith('//')) {
    return { kind: 'placeholder', reason: 'scheme', source };
  }
  if (documentPath === undefined || documentPath === '') {
    return { kind: 'placeholder', reason: 'untitled-document', source };
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return { kind: 'placeholder', reason: 'absolute-path', source };
  }

  const path = resolveLocalPath(trimmed, documentPath);
  if (path === undefined) {
    return { kind: 'placeholder', reason: 'malformed', source };
  }
  if (!isInsideDocumentFolder(path, documentPath)) {
    return { kind: 'placeholder', reason: 'outside-document-folder', source };
  }

  return { kind: 'local', path, source: trimmed };
}
