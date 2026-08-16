import type { DocumentMetadata } from '../../logic/store/appModelTypes';

const BIDI_CONTROLS = new Set([
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);

export interface TabLabel {
  basename: string;
  suffix?: string;
  label: string;
  accessibleName: string;
  tooltip: string;
}

function pathParts(document: DocumentMetadata): string[] {
  const source = document.path || document.displayName || document.title;
  return splitPath(source);
}

function splitPath(source: string): string[] {
  return source.replaceAll('\\', '/').split('/').filter(Boolean);
}

function rawBasename(document: DocumentMetadata): string {
  const parts = pathParts(document);
  return parts.at(-1) ?? 'Untitled';
}

function rawParentParts(document: DocumentMetadata): string[] {
  const parts = pathParts(document);
  return parts.slice(0, -1);
}

function normalizedPath(document: DocumentMetadata): string {
  return document.path.replaceAll('\\', '/');
}

function disambiguationBasename(document: DocumentMetadata): string {
  return rawBasename(document).replace(/[\p{Cc}\p{Cf}]/gu, '');
}

export function escapeUnsafeText(value: string): string {
  let escaped = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      BIDI_CONTROLS.has(codePoint)
    ) {
      escaped += `\\u${codePoint.toString(16).padStart(4, '0').toUpperCase()}`;
    } else {
      escaped += character;
    }
  }
  return escaped;
}

export function isolateUserText(value: string): string {
  return `\u2068${escapeUnsafeText(value)}\u2069`;
}

/**
 * The safe basename of an arbitrary path, for copy that must never expose a
 * full canonical path.
 *
 * FR-FT-048 forbids private full paths in user-facing failure copy, and the
 * classified error contract narrows every message to "the safe basename or the
 * document's shortest-unique disambiguated tab label". Callers outside the tab
 * strip have no document set to disambiguate against, so they get the same
 * escaping and directional isolation `tabLabelFor` applies, minus the suffix.
 *
 * Returns `undefined` for an absent or path-separator-only source so the caller
 * can fall back to its own untitled copy rather than render an empty subject.
 */
export function safeBasenameOf(source: string | undefined): string | undefined {
  if (source === undefined) return undefined;
  const basename = splitPath(source).at(-1);
  if (basename === undefined || basename.length === 0) return undefined;
  return isolateUserText(basename);
}

function shortestUniqueSuffix(
  document: DocumentMetadata,
  matching: readonly DocumentMetadata[],
): string | undefined {
  if (matching.length < 2) return undefined;
  const parents = matching.map(rawParentParts);
  const ownIndex = matching.findIndex(
    (candidate) => candidate.documentId === document.documentId,
  );
  const own = parents[ownIndex < 0 ? 0 : ownIndex] ?? [];
  const maxDepth = Math.max(...parents.map((parts) => parts.length), 1);
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const candidate = own.slice(-depth).join('/');
    const values = parents.map((parts) => parts.slice(-depth).join('/'));
    if (values.filter((value) => value === candidate).length === 1) {
      return candidate;
    }
  }
  // Duplicate canonical paths are not expected, but the identity suffix keeps
  // the accessible names complete if a hostile bridge supplies one.
  return `${own.join('/')} · ${document.documentId}`;
}

export function tabLabelFor(
  document: DocumentMetadata,
  documents: readonly DocumentMetadata[],
): TabLabel {
  const basename = rawBasename(document);
  const matching = documents.filter(
    (candidate) =>
      disambiguationBasename(candidate) === disambiguationBasename(document) &&
      normalizedPath(candidate) !== '' &&
      candidate.documentId !== document.documentId,
  );
  const allMatching = matching.length === 0 ? [] : [document, ...matching];
  const suffix = shortestUniqueSuffix(document, allMatching);
  const safeBasename = isolateUserText(basename);
  const safeSuffix = suffix === undefined ? undefined : isolateUserText(suffix);
  const label =
    safeSuffix === undefined ? safeBasename : `${safeBasename} — ${safeSuffix}`;
  return {
    basename: safeBasename,
    suffix: safeSuffix,
    label,
    accessibleName: label,
    tooltip: document.path,
  };
}

export function truncateTabLabel(label: TabLabel, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (label.label.length <= maxLength) return label.label;
  if (label.suffix === undefined) {
    return `${label.basename.slice(0, Math.max(0, maxLength - 1))}…`;
  }
  const separator = ' — ';
  const suffixBudget = Math.max(1, maxLength - separator.length - 2);
  const baseBudget = Math.max(
    1,
    maxLength - suffixBudget - separator.length - 1,
  );
  const suffix = label.suffix.slice(-suffixBudget);
  const basename = label.basename.slice(0, baseBudget);
  return `${basename}…${separator}${suffix}`.slice(0, maxLength);
}

export function tabLabelsFor(
  documents: readonly DocumentMetadata[],
): Map<string, TabLabel> {
  return new Map(
    documents.map((document) => [
      document.documentId,
      tabLabelFor(document, documents),
    ]),
  );
}
