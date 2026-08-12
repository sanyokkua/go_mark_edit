import { EventsEmit } from '../../runtime';
import type { apperr } from '../../../../../wailsjs/go/models';

type ActiveBufferResult = Pick<
  apperr.ActiveBuffer,
  'documentId' | 'documentRevision' | 'projectionRevision' | 'content'
>;
type ClassifiedErrorResult = Pick<
  apperr.ClassifiedError,
  | 'category'
  | 'safeSubject'
  | 'message'
  | 'remediation'
  | 'documentId'
  | 'dedupKey'
>;
type OpenResult = Pick<
  apperr.OpenResult,
  'status' | 'documentId' | 'projectionRevision' | 'activeBuffer' | 'error'
>;

type MockConflictPreview = {
  documentId: string;
  path?: string;
  displayName?: string;
  contentRevision: number;
  detectedDiskVersion: apperr.DiskVersion;
  onDisk: apperr.ConflictPreviewSide;
  yours: apperr.ConflictPreviewSide;
  metadataDifferences?: string[];
  readOnly: boolean;
};

type DocumentTransitionResult = {
  data?: ActiveBufferResult;
  conflict?: MockConflictPreview;
  error?: ClassifiedErrorResult;
};

interface CursorPosition {
  line: number;
  column: number;
}

interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
}

interface ScrollOffsets {
  editor: number;
  preview: number;
}

interface DocView {
  arrangement: string;
  editorVisible: boolean;
  previewVisible: boolean;
  cursor: CursorPosition;
  selection: SelectionRange;
  scroll: ScrollOffsets;
}

interface DocumentMetadata {
  documentId: string;
  title: string;
  path: string;
  displayName?: string;
  dirty: boolean;
  encoding: string;
  lineEnding: string;
  wordCount: number;
  capability?: string;
  status?: string;
  detached?: boolean;
  conflictBlocked?: boolean;
  writeInFlight?: boolean;
  sizeClass?: string;
  view: DocView;
}

interface UILayout {
  windowWidth?: number;
  windowHeight?: number;
  windowMaximized?: boolean;
  sidebarVisible?: boolean;
  sidebarWidth?: number;
  viewArrangement?: string;
}

interface DocViewInput {
  editorVisible: boolean;
  previewVisible: boolean;
  cursor: CursorPosition;
  selection: SelectionRange;
  scroll: ScrollOffsets;
}

interface WireError {
  code: string;
  title: string;
  message: string;
  retryable: boolean;
}

interface StateResult {
  data?: {
    snapshot: {
      revision: number;
      tabSetRevision: number;
      applicationVersion: string;
      documents: Record<string, DocumentMetadata>;
      orderedDocumentIds: string[];
      activeDocumentId: string;
      recentFiles?: string[];
      canReopenLastFile?: boolean;
      ui: UILayout;
    };
    activeBuffer?: ActiveBufferResult;
  };
  error?: WireError;
}

interface VoidResult {
  error?: WireError;
}

interface TabTransitionResult {
  status: string;
  documentId?: string;
  projectionRevision?: number;
  tabSetRevision?: number;
  orderedDocumentIds: string[];
  activeDocumentId?: string;
  activeBuffer?: ActiveBufferResult;
  error?: ClassifiedErrorResult;
}

type CloseChoice = 'save' | 'discard' | 'cancel' | 'save-all' | 'discard-all';
interface ClosePlanDecision {
  documentId?: string;
  choice: CloseChoice;
  decisionToken?: string;
}
interface CloseTarget {
  documentId: string;
  title: string;
  path?: string;
  savePath?: string;
  displayName?: string;
  contentRevision: number;
  dirty: boolean;
  capability?: string;
  writeInFlight?: boolean;
  status?: string;
  choice?: CloseChoice;
  normalizationToken?: string;
  proposedEnding?: 'lf' | 'crlf';
  conflict?: MockConflictPreview;
}
interface ClosePlanSummary {
  id: string;
  kind: string;
  tabSetRevision: number;
  targets: CloseTarget[];
  dirtyTargetIds?: string[];
  status:
    'collecting' | 'ready' | 'executing' | 'failed' | 'cancelled' | 'complete';
}
interface ClosePlanResult {
  data?: ClosePlanSummary;
  error?: ClassifiedErrorResult;
}

type MockConflictResult = {
  status: string;
  documentId?: string;
  projectionRevision?: number;
  documentRevision?: number;
  decisionToken?: string;
  activeBuffer?: ActiveBufferResult;
  preview?: MockConflictPreview;
  error?: ClassifiedErrorResult;
};

type ConflictMethod =
  | 'checkExternalChanges'
  | 'reloadFromDisk'
  | 'authorizeKeepMine'
  | 'skipConflict'
  | 'cancelConflict';

interface AppStatePatch {
  revision: number;
  tabSetRevision?: number;
  orderedDocumentIds?: string[];
  documents?: { upsert?: Record<string, DocumentMetadata>; remove?: string[] };
  activeDocumentId?: string;
  recentFiles?: string[];
  canReopenLastFile?: boolean;
  ui?: UILayout;
}

interface MockOpenSelection {
  path: string;
  content?: string;
  documentId?: string;
}

type MockWriteResult = {
  status: string;
  data?: {
    documentId: string;
    writtenContentRevision: number;
    committedProjectionRevision: number;
    targetPath?: string;
    targetPathAdopted: boolean;
    lineEndingOutcome: string;
    bomOutcome: string;
    resyncRequired: boolean;
  };
  decisionToken?: string;
  proposedEnding?: string;
  documentRevision?: number;
  error?: apperr.ClassifiedError;
};

interface MockDocument {
  metadata: DocumentMetadata;
  content: string;
  documentRevision: number;
}

interface RecentlyClosedMockDocument {
  content: string;
  path: string;
  title: string;
  view: DocView;
}

const initialDocumentId = 'mock-document';
const parityReleaseDocumentId = 'parity-release-notes';
const paritySpecDocumentId = 'parity-spec-draft';
const parityLargeFileContent = `# Large parity document\n${'large-file-content '.repeat(140_000)}\n`;
const parityReleaseContent = [
  '# Release Notes — v2.1',
  '',
  'We are exited to anounce the new',
  'relase. This verison brings alot of',
  'improvments and fixs users asked for.',
  '',
  '## Highlights',
  '- Faster startup',
  '- KaTeX math: $E = mc^2$',
  '- ![flow](./assets/flow.png)',
  '',
  '> Tip: press Ctrl+S to save.',
  '',
  '```mermaid',
  'graph LR; A-->B; B-->C;',
  '```',
  '',
].join('\n');
const e2eRecentFiles = [
  '/tmp/t032-recent-07.md',
  '/tmp/t032-recent-06.md',
  '/tmp/t032-recent-05.md',
  '/tmp/t032-recent-04.md',
  '/tmp/t032-recent-03.md',
  '/tmp/t032-recent-02.md',
  '/tmp/t032-recent-01.md',
];
/*
 * The binding File menu lists exactly two recent files under its Open Recent
 * group label. The parity File-menu case seeds those so the compared popup
 * shows real, dispatchable recent entries rather than disabled placeholders.
 */
const parityFileMenuRecentFiles = [
  '/tmp/release-notes.md',
  '/tmp/spec-draft.md',
];
const parityLauncherRecentFiles = [
  '/tmp/parity-recent-06.md',
  '/tmp/parity-recent-05.md',
  '/tmp/parity-recent-04.md',
  '/tmp/parity-recent-03.md',
  '/tmp/parity-recent-02.md',
  '/tmp/parity-recent-01.md',
];

function seededRecentFiles(): string[] {
  if (typeof window === 'undefined') return [];
  const query = new URLSearchParams(window.location.search);
  const state = parityStateId();
  if (state === 'launcher-first-run') {
    return [];
  }
  if (state === 'launcher-six-file') {
    return [...parityLauncherRecentFiles];
  }
  const parityCase = query.get('parity-case');
  if (
    parityCase?.startsWith('primary:menu-file:') === true ||
    parityCase?.startsWith('targeted:file-menu:') === true
  ) {
    return [...parityFileMenuRecentFiles];
  }
  if (query.has('parity-case')) {
    return [];
  }
  return query.has('ft-vs-07') ? [...e2eRecentFiles] : [];
}

function parityFixtureEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case')
  );
}

function parityStateId(): string | undefined {
  if (!parityFixtureEnabled()) return undefined;
  const key = new URLSearchParams(window.location.search).get('parity-case');
  if (key === null || !key.startsWith('state:')) return undefined;
  return key.split(':')[1];
}

let revision = 0;
let tabSetRevision = 0;
function initialDocumentIds(): string[] {
  if (parityStateId() === 'tab-40-document') {
    return [
      parityReleaseDocumentId,
      ...Array.from({ length: 39 }, (_, index) => `parity-tab-${index + 1}`),
    ];
  }
  return parityFixtureEnabled()
    ? [parityReleaseDocumentId, paritySpecDocumentId]
    : [initialDocumentId];
}

let orderedDocumentIds: string[] = initialDocumentIds();
let activeDocumentId = orderedDocumentIds[0] ?? initialDocumentId;
let recentFiles: string[] = seededRecentFiles();
let recentlyClosed: RecentlyClosedMockDocument[] = [];
let nextUntitledNumber = 2;
let nextReopenDocumentNumber = 1;
let openSelection: MockOpenSelection | null = null;
let mockSaveResult: MockWriteResult | undefined;
let mockSaveAsResult: MockWriteResult | undefined;
let mockConflictResults: Partial<Record<ConflictMethod, MockConflictResult>> =
  {};
let nextClosePlanNumber = 1;
let mockClosePlans = new Map<string, ClosePlanSummary>();
let mockCopyPathResult:
  { status: string; error?: ClassifiedErrorResult } | undefined;
let mockRevealResult:
  { status: string; error?: ClassifiedErrorResult } | undefined;
let layout: UILayout = {
  windowWidth: 1024,
  windowHeight: 768,
  sidebarVisible: true,
};
let pendingContinuousLayout: UILayout | undefined;
let pendingContinuousTimer: ReturnType<typeof setTimeout> | undefined;

function newDocumentMetadata(
  documentId: string,
  title: string,
  path = '',
): DocumentMetadata {
  return {
    documentId,
    title,
    path,
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 0,
    capability: 'writable',
    status: 'not-saved',
    view: {
      arrangement: 'split',
      editorVisible: true,
      previewVisible: true,
      cursor: { line: 1, column: 1 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
      scroll: { editor: 0, preview: 0 },
    },
  };
}

function configureParityFixture(
  releaseNotes: DocumentMetadata,
  specDraft: DocumentMetadata,
): void {
  const state = parityStateId();
  switch (state) {
    case 'status-saved':
      releaseNotes.dirty = false;
      releaseNotes.status = 'saved';
      break;
    case 'status-unsaved-changes':
    case 'tab-dirty':
      releaseNotes.dirty = true;
      releaseNotes.status = 'unsaved-changes';
      break;
    case 'status-read-only':
    case 'tab-read-only':
      releaseNotes.capability = 'read-only';
      releaseNotes.status = 'read-only';
      break;
    case 'tab-detached':
      releaseNotes.detached = true;
      releaseNotes.capability = 'read-only';
      releaseNotes.status = 'read-only';
      break;
    case 'tab-autosave-in-flight':
      releaseNotes.dirty = true;
      releaseNotes.status = 'autosaved';
      releaseNotes.writeInFlight = true;
      break;
    case 'tab-identical-basename':
      releaseNotes.title = 'notes.md';
      releaseNotes.path = '/tmp/projects/alpha/notes.md';
      specDraft.title = 'notes.md';
      specDraft.path = '/tmp/projects/beta/notes.md';
      break;
    case 'tab-contained-overflow':
      releaseNotes.title =
        'release-notes-with-a-deliberately-contained-tab-label.md';
      releaseNotes.path = `/tmp/projects/${releaseNotes.title}`;
      specDraft.title = 'spec-draft-with-a-deliberately-contained-tab-label.md';
      specDraft.path = `/tmp/projects/${specDraft.title}`;
      break;
    case 'tab-40-document':
      break;
    case 'label-short':
      releaseNotes.title = 'a.md';
      releaseNotes.path = '/tmp/a.md';
      break;
    case 'label-long-localized':
      releaseNotes.title =
        'release-notes-for-the-localized-document-identity-preview.md';
      releaseNotes.path = `/tmp/projects/${releaseNotes.title}`;
      break;
    case 'path-hostile-disambiguated':
      releaseNotes.title = 'notes.md';
      releaseNotes.path = '/tmp/projects/alpha/notes\u202E.md';
      specDraft.title = 'notes.md';
      specDraft.path = '/tmp/projects/beta/notes.md';
      break;
    case 'identity-not-saved':
      releaseNotes.title = 'Untitled';
      releaseNotes.path = '';
      releaseNotes.dirty = false;
      releaseNotes.status = 'not-saved';
      break;
    case 'status-mixed-ending':
      releaseNotes.lineEnding = 'mixed';
      break;
    case 'status-large-file':
    case 'preview-paused':
    case 'preview-refreshing':
    case 'preview-refresh-failed':
      releaseNotes.sizeClass = 'large';
      releaseNotes.wordCount = 420_000;
      break;
    case 'quit-discard-newer':
      releaseNotes.dirty = true;
      releaseNotes.status = 'unsaved-changes';
      break;
    case 'prompt-normalization':
    case 'resync-recovery':
      releaseNotes.dirty = true;
      releaseNotes.status = 'unsaved-changes';
      releaseNotes.lineEnding = 'crlf';
      break;
    default:
      break;
  }
}

function initialDocuments(): Record<string, MockDocument> {
  if (parityFixtureEnabled()) {
    const releaseNotes = newDocumentMetadata(
      parityReleaseDocumentId,
      'release-notes.md',
      '/tmp/Notes/projects/release-notes.md',
    );
    releaseNotes.dirty = true;
    releaseNotes.status = 'autosaved';
    releaseNotes.wordCount = 42;
    releaseNotes.view.selection = {
      start: { line: 4, column: 1 },
      end: {
        line: 5,
        column: 'improvments and fixs users asked for.'.length + 1,
      },
    };
    const specDraft = newDocumentMetadata(
      paritySpecDocumentId,
      'spec-draft.md',
      '/tmp/Notes/projects/spec-draft.md',
    );
    specDraft.status = 'saved';
    configureParityFixture(releaseNotes, specDraft);
    const fixture: Record<string, MockDocument> = {
      [parityReleaseDocumentId]: {
        metadata: releaseNotes,
        content:
          parityStateId() === 'status-large-file' ||
          parityStateId()?.startsWith('preview-') === true
            ? parityLargeFileContent
            : parityReleaseContent,
        documentRevision: 1,
      },
      [paritySpecDocumentId]: {
        metadata: specDraft,
        content: '# Specification draft\n',
        documentRevision: 1,
      },
    };
    if (parityStateId() === 'tab-40-document') {
      for (let index = 1; index <= 39; index += 1) {
        const documentId = `parity-tab-${index}`;
        const title = `document-${index + 1}.md`;
        fixture[documentId] = {
          metadata: newDocumentMetadata(
            documentId,
            title,
            `/tmp/projects/${title}`,
          ),
          content: `# ${title}\n`,
          documentRevision: 1,
        };
      }
    }
    return fixture;
  }
  return {
    [initialDocumentId]: {
      metadata: newDocumentMetadata(initialDocumentId, 'Untitled'),
      content: '',
      documentRevision: 0,
    },
  };
}

let documents = initialDocuments();

function activeDocument(): MockDocument {
  return documents[activeDocumentId];
}

function cloneMetadata(document: MockDocument): DocumentMetadata {
  return {
    ...document.metadata,
    view: {
      ...document.metadata.view,
      cursor: { ...document.metadata.view.cursor },
      selection: {
        start: { ...document.metadata.view.selection.start },
        end: { ...document.metadata.view.selection.end },
      },
      scroll: { ...document.metadata.view.scroll },
    },
  };
}

function activeBuffer(
  document: MockDocument | undefined,
): ActiveBufferResult | undefined {
  if (document === undefined) return undefined;
  return {
    documentId: document.metadata.documentId,
    documentRevision: document.documentRevision,
    projectionRevision: revision,
    content: document.content,
  };
}

function promoteRecentFile(path: string): void {
  recentFiles = [
    path,
    ...recentFiles.filter((candidate) => candidate !== path),
  ].slice(0, 6);
}

function rememberClosed(document: MockDocument): void {
  if (document.metadata.path === '') return;
  recentlyClosed = [
    {
      content: document.content,
      path: document.metadata.path,
      title: document.metadata.title,
      view: cloneView(document.metadata.view),
    },
    ...recentlyClosed.filter(
      (candidate) => candidate.path !== document.metadata.path,
    ),
  ].slice(0, 40);
}

function cloneView(view: DocView): DocView {
  return {
    ...view,
    cursor: { ...view.cursor },
    selection: {
      start: { ...view.selection.start },
      end: { ...view.selection.end },
    },
    scroll: { ...view.scroll },
  };
}

function e2eConflictEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('ft-vs-04') ||
      parityStateId() === 'tab-blocked-conflict' ||
      parityStateId() === 'conflict-content-truncated' ||
      parityStateId() === 'conflict-metadata-only' ||
      parityStateId() === 'conflict-read-only')
  );
}

function e2eConflictPreview(document: MockDocument): MockConflictPreview {
  const state = parityStateId();
  const truncatedText = Array.from(
    { length: 13 },
    (_, index) => `line ${index + 1} ${'x'.repeat(420)}`,
  ).join('\n');
  return {
    contentRevision: document.documentRevision,
    detectedDiskVersion: {
      exists: true,
      mode: 0o644,
      modifiedUnixNano: 7,
      size: 12,
    },
    displayName: document.metadata.title,
    documentId: document.metadata.documentId,
    onDisk: {
      byteCount: state === 'conflict-content-truncated' ? 5_500 : 6,
      lineCount: state === 'conflict-content-truncated' ? 13 : 1,
      text: state === 'conflict-content-truncated' ? truncatedText : 'disk\n',
      truncated: state === 'conflict-content-truncated',
    },
    path: document.metadata.path || undefined,
    metadataDifferences:
      state === 'conflict-metadata-only' ? ['file mode changed'] : undefined,
    readOnly: state === 'conflict-read-only',
    yours: {
      byteCount: state === 'conflict-content-truncated' ? 5_500 : 6,
      lineCount: state === 'conflict-content-truncated' ? 13 : 1,
      text: state === 'conflict-content-truncated' ? truncatedText : 'mine\n',
      truncated: state === 'conflict-content-truncated',
    },
  };
}

function classifiedError(
  category: string,
  message: string,
  dedupKey: string,
): ClassifiedErrorResult {
  return {
    category,
    message,
    remediation: 'Retry',
    dedupKey,
  };
}

function emitPatch(patch: AppStatePatch): void {
  EventsEmit('state:patch', patch);
}

function notFound(): VoidResult {
  return {
    error: {
      code: 'not_found',
      title: 'Document not found',
      message: 'The mock document does not exist.',
      retryable: false,
    },
  };
}

export function GetState(): Promise<StateResult> {
  const current = activeDocument();
  return Promise.resolve({
    data: {
      snapshot: {
        revision,
        tabSetRevision,
        applicationVersion: 'dev',
        documents: Object.fromEntries(
          orderedDocumentIds.map((id) => [id, cloneMetadata(documents[id])]),
        ),
        orderedDocumentIds: [...orderedDocumentIds],
        activeDocumentId,
        recentFiles: [...recentFiles],
        canReopenLastFile: recentlyClosed.length > 0,
        ui: { ...layout },
      },
      activeBuffer: activeBuffer(current),
    },
  });
}

export function resetMockAppModel(): void {
  if (pendingContinuousTimer !== undefined) {
    clearTimeout(pendingContinuousTimer);
  }
  revision = 0;
  tabSetRevision = 0;
  orderedDocumentIds = initialDocumentIds();
  activeDocumentId = orderedDocumentIds[0] ?? initialDocumentId;
  recentFiles = seededRecentFiles();
  recentlyClosed = [];
  nextUntitledNumber = 2;
  nextReopenDocumentNumber = 1;
  nextClosePlanNumber = 1;
  mockClosePlans = new Map();
  openSelection = null;
  mockSaveResult = undefined;
  mockSaveAsResult = undefined;
  mockConflictResults = {};
  mockCopyPathResult = undefined;
  mockRevealResult = undefined;
  documents = initialDocuments();
  layout = {
    windowWidth: 1024,
    windowHeight: 768,
    sidebarVisible: true,
  };
  pendingContinuousLayout = undefined;
  pendingContinuousTimer = undefined;
}

export function setMockOpenSelection(
  selection: MockOpenSelection | null,
): void {
  openSelection = selection;
}

export function setMockSaveResult(result: MockWriteResult | null): void {
  mockSaveResult = result ?? undefined;
}

export function setMockSaveAsResult(result: MockWriteResult | null): void {
  mockSaveAsResult = result ?? undefined;
}

export function setMockConflictResult(
  method: ConflictMethod,
  result: MockConflictResult | null,
): void {
  if (result === null) {
    delete mockConflictResults[method];
    return;
  }
  mockConflictResults[method] = result;
}

export function setMockCopyPathResult(
  result: { status: string; error?: ClassifiedErrorResult } | null,
): void {
  mockCopyPathResult = result ?? undefined;
}

export function setMockRevealResult(
  result: { status: string; error?: ClassifiedErrorResult } | null,
): void {
  mockRevealResult = result ?? undefined;
}

function expectedRevisionMatches(expectedTabSetRevision: number): boolean {
  return expectedTabSetRevision === tabSetRevision;
}

function staleRevisionError(): ClassifiedErrorResult {
  return classifiedError(
    'conflict',
    'The tab set changed before this operation completed.',
    'mock-tab-revision-conflict',
  );
}

function emitTabTransitionPatch(document: MockDocument): void {
  revision += 1;
  emitPatch({
    revision,
    tabSetRevision,
    orderedDocumentIds: [...orderedDocumentIds],
    activeDocumentId: document.metadata.documentId,
    recentFiles: [...recentFiles],
    canReopenLastFile: recentlyClosed.length > 0,
    documents: {
      upsert: { [document.metadata.documentId]: cloneMetadata(document) },
    },
  });
}

export function NewDocument(
  expectedTabSetRevision: number,
): Promise<DocumentTransitionResult> {
  if (!expectedRevisionMatches(expectedTabSetRevision)) {
    return Promise.resolve({ error: staleRevisionError() });
  }

  const documentId = `mock-document-${nextUntitledNumber}`;
  const document: MockDocument = {
    metadata: newDocumentMetadata(documentId, `Untitled ${nextUntitledNumber}`),
    content: '',
    documentRevision: 0,
  };
  nextUntitledNumber += 1;
  documents = { ...documents, [documentId]: document };
  orderedDocumentIds = [...orderedDocumentIds, documentId];
  activeDocumentId = documentId;
  tabSetRevision += 1;
  emitTabTransitionPatch(document);

  return Promise.resolve({ data: activeBuffer(document) });
}

function selectedDocumentId(
  path: string,
  requestedDocumentId?: string,
): string {
  if (requestedDocumentId !== undefined) return requestedDocumentId;
  const normalized = path.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || 'selected.md';
}

export function OpenDocument(
  expectedTabSetRevision: number,
): Promise<OpenResult> {
  if (!expectedRevisionMatches(expectedTabSetRevision)) {
    return Promise.resolve({ status: 'refused', error: staleRevisionError() });
  }
  const selection = openSelection;
  openSelection = null;
  if (selection === null || selection.path.length === 0) {
    return Promise.resolve({ status: 'cancelled' });
  }

  const displayName = selectedDocumentId(selection.path);
  const documentId = selectedDocumentId(selection.path, selection.documentId);
  const existing = documents[documentId];
  if (existing !== undefined) {
    promoteRecentFile(selection.path);
    activeDocumentId = documentId;
    revision += 1;
    emitPatch({
      revision,
      activeDocumentId: documentId,
      recentFiles: [...recentFiles],
    });
    return Promise.resolve({
      status: 'focused',
      documentId,
      projectionRevision: revision,
      activeBuffer: activeBuffer(existing),
    });
  }

  const document: MockDocument = {
    metadata: newDocumentMetadata(documentId, displayName, selection.path),
    content: selection.content ?? `# ${documentId}`,
    documentRevision: 0,
  };
  document.metadata.wordCount = document.content.trim().split(/\s+/).length;
  promoteRecentFile(selection.path);
  documents = { ...documents, [documentId]: document };
  orderedDocumentIds = [...orderedDocumentIds, documentId];
  activeDocumentId = documentId;
  tabSetRevision += 1;
  emitTabTransitionPatch(document);
  return Promise.resolve({
    status: 'opened',
    documentId,
    projectionRevision: revision,
    activeBuffer: activeBuffer(document),
  });
}

export function OpenRecentFile(
  path: string,
  expectedTabSetRevision: number,
): Promise<OpenResult> {
  const wasRecentlyClosed = recentlyClosed.some((entry) => entry.path === path);
  setMockOpenSelection({
    path,
    documentId: wasRecentlyClosed
      ? `${selectedDocumentId(path)}-reopened-${nextReopenDocumentNumber++}`
      : undefined,
  });
  return OpenDocument(expectedTabSetRevision);
}

export async function ReopenLastFile(
  expectedTabSetRevision: number,
): Promise<OpenResult> {
  if (!expectedRevisionMatches(expectedTabSetRevision)) {
    return { status: 'refused', error: staleRevisionError() };
  }
  const entry = recentlyClosed[0];
  if (entry === undefined) {
    return {
      status: 'refused',
      error: classifiedError(
        'not-found',
        'There is no recently closed file to reopen.',
        'mock-reopen-empty',
      ),
    };
  }

  setMockOpenSelection({
    path: entry.path,
    content: entry.content,
    documentId: `${selectedDocumentId(entry.path)}-reopened-${nextReopenDocumentNumber++}`,
  });
  const result = await OpenDocument(expectedTabSetRevision);
  if (result.status !== 'opened' && result.status !== 'focused') {
    return result;
  }
  recentlyClosed = recentlyClosed.filter(
    (candidate) => candidate.path !== entry.path,
  );
  const reopened =
    result.documentId === undefined ? undefined : documents[result.documentId];
  if (reopened !== undefined) {
    reopened.metadata = { ...reopened.metadata, view: cloneView(entry.view) };
    revision += 1;
    emitPatch({
      revision,
      canReopenLastFile: recentlyClosed.length > 0,
      documents: {
        upsert: { [reopened.metadata.documentId]: cloneMetadata(reopened) },
      },
    });
  }
  return result;
}

export function ActivateDocument(
  requestedDocumentId: string,
  expectedTabSetRevision: number,
): Promise<DocumentTransitionResult> {
  if (!expectedRevisionMatches(expectedTabSetRevision)) {
    return Promise.resolve({ error: staleRevisionError() });
  }
  const document = documents[requestedDocumentId];
  if (document === undefined) {
    return Promise.resolve({
      error: classifiedError(
        'not-found',
        'The document is no longer open.',
        `mock-not-found:${requestedDocumentId}`,
      ),
    });
  }
  if (activeDocumentId !== requestedDocumentId) {
    activeDocumentId = requestedDocumentId;
    tabSetRevision += 1;
    revision += 1;
    emitPatch({
      revision,
      tabSetRevision,
      orderedDocumentIds: [...orderedDocumentIds],
      activeDocumentId,
    });
  }
  if (e2eConflictEnabled()) {
    const conflict = e2eConflictPreview(document);
    document.metadata = { ...document.metadata, conflictBlocked: true };
    revision += 1;
    emitPatch({
      revision,
      documents: { upsert: { [requestedDocumentId]: cloneMetadata(document) } },
    });
    return Promise.resolve({ data: activeBuffer(document), conflict });
  }
  return Promise.resolve({ data: activeBuffer(document) });
}

export function ReorderDocument(
  requestedDocumentId: string,
  targetIndex: number,
  expectedTabSetRevision: number,
): Promise<TabTransitionResult> {
  if (!expectedRevisionMatches(expectedTabSetRevision)) {
    return Promise.resolve({
      status: 'refused',
      orderedDocumentIds: [],
      error: staleRevisionError(),
    });
  }
  const currentIndex = orderedDocumentIds.indexOf(requestedDocumentId);
  if (currentIndex < 0) {
    return Promise.resolve({
      status: 'refused',
      documentId: requestedDocumentId,
      orderedDocumentIds: [...orderedDocumentIds],
      error: classifiedError(
        'not-found',
        'The document is no longer open.',
        `mock-not-found:${requestedDocumentId}`,
      ),
    });
  }
  const atEdge =
    targetIndex === currentIndex ||
    (currentIndex === 0 && targetIndex === -1) ||
    (currentIndex === orderedDocumentIds.length - 1 &&
      targetIndex === orderedDocumentIds.length);
  if (atEdge) {
    return Promise.resolve({
      status: 'noop',
      documentId: requestedDocumentId,
      projectionRevision: revision,
      tabSetRevision,
      orderedDocumentIds: [...orderedDocumentIds],
      activeDocumentId,
    });
  }
  if (
    targetIndex < 0 ||
    targetIndex >= orderedDocumentIds.length ||
    Math.abs(targetIndex - currentIndex) !== 1
  ) {
    return Promise.resolve({
      status: 'refused',
      documentId: requestedDocumentId,
      orderedDocumentIds: [...orderedDocumentIds],
      error: classifiedError(
        'unsupported-input',
        'The requested tab position is invalid.',
        `mock-invalid-order:${requestedDocumentId}`,
      ),
    });
  }
  const nextOrder = [...orderedDocumentIds];
  [nextOrder[currentIndex], nextOrder[targetIndex]] = [
    nextOrder[targetIndex],
    nextOrder[currentIndex],
  ];
  orderedDocumentIds = nextOrder;
  tabSetRevision += 1;
  revision += 1;
  emitPatch({
    revision,
    tabSetRevision,
    orderedDocumentIds: [...orderedDocumentIds],
    activeDocumentId,
  });
  return Promise.resolve({
    status: 'reordered',
    documentId: requestedDocumentId,
    projectionRevision: revision,
    tabSetRevision,
    orderedDocumentIds: [...orderedDocumentIds],
    activeDocumentId,
  });
}

export function CloseDocument(
  requestedDocumentId: string,
  expectedTabSetRevision: number,
): Promise<TabTransitionResult> {
  if (!expectedRevisionMatches(expectedTabSetRevision)) {
    return Promise.resolve({
      status: 'refused',
      orderedDocumentIds: [],
      error: staleRevisionError(),
    });
  }
  const currentIndex = orderedDocumentIds.indexOf(requestedDocumentId);
  if (currentIndex < 0) {
    return Promise.resolve({
      status: 'refused',
      documentId: requestedDocumentId,
      orderedDocumentIds: [...orderedDocumentIds],
      error: classifiedError(
        'not-found',
        'The document is no longer open.',
        `mock-not-found:${requestedDocumentId}`,
      ),
    });
  }
  const closing = documents[requestedDocumentId];
  if (closing !== undefined) rememberClosed(closing);
  orderedDocumentIds = orderedDocumentIds.filter(
    (documentId) => documentId !== requestedDocumentId,
  );
  delete documents[requestedDocumentId];
  if (activeDocumentId === requestedDocumentId) {
    activeDocumentId =
      orderedDocumentIds[currentIndex] ??
      orderedDocumentIds[currentIndex - 1] ??
      '';
  }
  tabSetRevision += 1;
  revision += 1;
  emitPatch({
    revision,
    tabSetRevision,
    orderedDocumentIds: [...orderedDocumentIds],
    activeDocumentId,
    canReopenLastFile: recentlyClosed.length > 0,
    documents: { remove: [requestedDocumentId] },
  });
  const nextActive =
    activeDocumentId === '' ? undefined : documents[activeDocumentId];
  return Promise.resolve({
    status: 'closed',
    documentId: requestedDocumentId,
    projectionRevision: revision,
    tabSetRevision,
    orderedDocumentIds: [...orderedDocumentIds],
    activeDocumentId,
    activeBuffer:
      nextActive === undefined ? undefined : activeBuffer(nextActive),
  });
}

function cloneClosePlan(plan: ClosePlanSummary): ClosePlanSummary {
  return {
    ...plan,
    dirtyTargetIds: plan.dirtyTargetIds ? [...plan.dirtyTargetIds] : undefined,
    targets: plan.targets.map((target) => ({
      ...target,
      conflict: target.conflict
        ? {
            ...target.conflict,
            detectedDiskVersion: { ...target.conflict.detectedDiskVersion },
          }
        : undefined,
    })),
  };
}

function closePlanTargetIds(plan: ClosePlanSummary): string[] {
  return plan.targets.map((target) => target.documentId);
}

export function PrepareClose(
  kind: string,
  requestedTargetIds: string[],
  expectedTabSetRevision: number,
): Promise<ClosePlanResult> {
  if (!expectedRevisionMatches(expectedTabSetRevision)) {
    return Promise.resolve({ error: staleRevisionError() });
  }
  const requested =
    kind === 'window' || kind === 'quit'
      ? [...orderedDocumentIds]
      : [...new Set(requestedTargetIds)];
  const targets = orderedDocumentIds
    .filter((documentId) => requested.includes(documentId))
    .map((documentId): CloseTarget => {
      const document = documents[documentId];
      return {
        documentId,
        title: document.metadata.title,
        path: document.metadata.path || undefined,
        displayName: document.metadata.title,
        contentRevision: document.documentRevision,
        dirty: document.metadata.dirty,
        capability: 'writable',
        status: document.metadata.status,
        normalizationToken:
          parityStateId() === 'prompt-normalization'
            ? 'parity-normalization-token'
            : undefined,
        proposedEnding:
          parityStateId() === 'prompt-normalization' ? 'lf' : undefined,
      };
    });
  const dirtyTargetIds = targets
    .filter((target) => target.dirty)
    .map((target) => target.documentId);
  const plan: ClosePlanSummary = {
    id: `mock-close-plan-${nextClosePlanNumber++}`,
    kind,
    tabSetRevision,
    targets,
    dirtyTargetIds,
    status: dirtyTargetIds.length > 0 ? 'collecting' : 'ready',
  };
  mockClosePlans.set(plan.id, plan);
  return Promise.resolve({ data: cloneClosePlan(plan) });
}

export function ResolveClosePlan(
  planId: string,
  decisions: ClosePlanDecision[],
): Promise<ClosePlanResult> {
  const plan = mockClosePlans.get(planId);
  if (plan === undefined) {
    return Promise.resolve({
      error: classifiedError(
        'not-found',
        'The close plan is no longer active.',
        planId,
      ),
    });
  }
  if (decisions.some((decision) => decision.choice === 'cancel')) {
    plan.status = 'cancelled';
    mockClosePlans.delete(planId);
    return Promise.resolve({ data: cloneClosePlan(plan) });
  }
  const allChoice = decisions.find(
    (decision) =>
      decision.choice === 'save-all' || decision.choice === 'discard-all',
  )?.choice;
  for (const target of plan.targets) {
    if (!target.dirty) continue;
    const decision = decisions.find(
      (candidate) => candidate.documentId === target.documentId,
    );
    const choice =
      allChoice === 'save-all'
        ? 'save'
        : allChoice === 'discard-all'
          ? 'discard'
          : decision?.choice;
    if (choice !== 'save' && choice !== 'discard') {
      return Promise.resolve({ data: cloneClosePlan(plan) });
    }
    target.choice = choice;
  }
  plan.status = 'ready';
  return Promise.resolve({ data: cloneClosePlan(plan) });
}

export function ExecuteClosePlan(planId: string): Promise<TabTransitionResult> {
  const plan = mockClosePlans.get(planId);
  if (plan === undefined || plan.status !== 'ready') {
    return Promise.resolve({
      status: 'refused',
      orderedDocumentIds: [],
      error: classifiedError(
        'conflict',
        'The close plan is incomplete.',
        planId,
      ),
    });
  }
  plan.status = 'executing';
  const targetIds = closePlanTargetIds(plan);
  const targetSet = new Set(targetIds);
  for (const targetId of targetIds) {
    const document = documents[targetId];
    if (document !== undefined) rememberClosed(document);
  }
  for (const target of plan.targets) {
    if (target.choice === 'save') {
      const document = documents[target.documentId];
      document.metadata = {
        ...document.metadata,
        dirty: false,
        status: 'saved',
      };
    }
  }
  const activeIndex = orderedDocumentIds.indexOf(activeDocumentId);
  orderedDocumentIds = orderedDocumentIds.filter(
    (documentId) => !targetSet.has(documentId),
  );
  for (const documentId of targetIds) delete documents[documentId];
  if (targetSet.has(activeDocumentId)) {
    activeDocumentId =
      orderedDocumentIds[
        Math.min(activeIndex, orderedDocumentIds.length - 1)
      ] ?? '';
  }
  tabSetRevision += 1;
  revision += 1;
  emitPatch({
    revision,
    tabSetRevision,
    orderedDocumentIds: [...orderedDocumentIds],
    activeDocumentId,
    canReopenLastFile: recentlyClosed.length > 0,
    documents: { remove: targetIds },
  });
  plan.status = 'complete';
  mockClosePlans.delete(planId);
  const nextActive =
    activeDocumentId === '' ? undefined : documents[activeDocumentId];
  return Promise.resolve({
    status: 'closed',
    documentId: targetIds[0],
    projectionRevision: revision,
    tabSetRevision,
    orderedDocumentIds: [...orderedDocumentIds],
    activeDocumentId,
    activeBuffer:
      nextActive === undefined ? undefined : activeBuffer(nextActive),
  });
}

export function CopyPath(
  requestedDocumentId: string,
): Promise<{ status: string; error?: ClassifiedErrorResult }> {
  if (documents[requestedDocumentId] === undefined) {
    return Promise.resolve({
      status: 'refused',
      error: classifiedError(
        'not-found',
        'The document is no longer open.',
        `mock-not-found:${requestedDocumentId}`,
      ),
    });
  }
  if (mockCopyPathResult !== undefined)
    return Promise.resolve(mockCopyPathResult);
  if (documents[requestedDocumentId].metadata.path === '') {
    return Promise.resolve({
      status: 'refused',
      error: classifiedError(
        'unsupported-input',
        'This document does not have a file path.',
        `mock-untitled:${requestedDocumentId}`,
      ),
    });
  }
  return Promise.resolve({ status: 'copied' });
}

export function RevealInFileManager(
  requestedDocumentId: string,
): Promise<{ status: string; error?: ClassifiedErrorResult }> {
  if (documents[requestedDocumentId] === undefined) {
    return Promise.resolve({
      status: 'refused',
      error: classifiedError(
        'not-found',
        'The document is no longer open.',
        `mock-not-found:${requestedDocumentId}`,
      ),
    });
  }
  if (mockRevealResult !== undefined) return Promise.resolve(mockRevealResult);
  const document = documents[requestedDocumentId];
  if (document.metadata.path === '' || document.metadata.detached === true) {
    return Promise.resolve({ status: 'unavailable' });
  }
  return Promise.resolve({ status: 'revealed' });
}

export function UpdateBuffer(
  requestedDocumentId: string,
  nextContent: string,
): Promise<VoidResult> {
  const document = documents[requestedDocumentId];
  if (document === undefined) {
    return Promise.resolve(notFound());
  }

  document.content = nextContent;
  document.documentRevision += 1;
  document.metadata = {
    ...document.metadata,
    dirty: nextContent.length > 0,
    status: nextContent.length > 0 ? 'unsaved-changes' : 'not-saved',
    wordCount:
      nextContent.trim() === '' ? 0 : nextContent.trim().split(/\s+/).length,
  };
  revision += 1;
  emitPatch({
    revision,
    documents: { upsert: { [requestedDocumentId]: cloneMetadata(document) } },
  });
  return Promise.resolve({});
}

function conflictResultFor(
  method: ConflictMethod,
  requestedDocumentId: string,
): MockConflictResult {
  const configured = mockConflictResults[method];
  if (configured !== undefined) {
    return {
      ...configured,
      documentId: configured.documentId ?? requestedDocumentId,
    };
  }
  const status =
    method === 'checkExternalChanges'
      ? 'unchanged'
      : method === 'reloadFromDisk'
        ? 'reloaded'
        : method === 'authorizeKeepMine'
          ? 'authorized'
          : method === 'skipConflict'
            ? 'skipped'
            : 'cancelled';
  return { status, documentId: requestedDocumentId };
}

function publishConflictProjection(
  requestedDocumentId: string,
  result: MockConflictResult,
): void {
  const document = documents[requestedDocumentId];
  if (document === undefined || result.status !== 'detected') return;
  document.metadata = {
    ...document.metadata,
    conflictBlocked: true,
  };
  revision += 1;
  emitPatch({
    revision,
    documents: { upsert: { [requestedDocumentId]: cloneMetadata(document) } },
  });
}

export function CheckExternalChanges(
  requestedDocumentId: string,
): Promise<MockConflictResult> {
  const result = conflictResultFor('checkExternalChanges', requestedDocumentId);
  publishConflictProjection(requestedDocumentId, result);
  return Promise.resolve(result);
}

export function ReloadFromDisk(
  requestedDocumentId: string,
  _contentRevision: number,
  _detectedVersion: apperr.DiskVersion,
): Promise<MockConflictResult> {
  void _contentRevision;
  void _detectedVersion;
  return Promise.resolve(
    conflictResultFor('reloadFromDisk', requestedDocumentId),
  );
}

export function AuthorizeKeepMine(
  requestedDocumentId: string,
  _contentRevision: number,
  _path: string,
  _detectedVersion: apperr.DiskVersion,
): Promise<MockConflictResult> {
  void _contentRevision;
  void _path;
  void _detectedVersion;
  return Promise.resolve(
    conflictResultFor('authorizeKeepMine', requestedDocumentId),
  );
}

export function SkipConflict(
  requestedDocumentId: string,
  _contentRevision: number,
  _detectedVersion: apperr.DiskVersion,
): Promise<MockConflictResult> {
  void _contentRevision;
  void _detectedVersion;
  return Promise.resolve(
    conflictResultFor('skipConflict', requestedDocumentId),
  );
}

export function CancelConflict(
  requestedDocumentId: string,
  _contentRevision: number,
  _detectedVersion: apperr.DiskVersion,
): Promise<MockConflictResult> {
  void _contentRevision;
  void _detectedVersion;
  return Promise.resolve(
    conflictResultFor('cancelConflict', requestedDocumentId),
  );
}

function writeResultFor(
  requestedDocumentId: string,
  result: MockWriteResult | undefined,
  saveAs: boolean,
): MockWriteResult {
  const document = documents[requestedDocumentId];
  if (document === undefined) {
    return {
      status: 'refused',
      error: {
        category: 'not-found',
        safeSubject: requestedDocumentId,
        message: 'The mock document does not exist.',
        remediation: 'Cancel',
        documentId: requestedDocumentId,
        dedupKey: `mock-not-found:${requestedDocumentId}`,
      },
    };
  }
  if (result !== undefined) {
    return result;
  }

  const targetPath =
    document.metadata.path ||
    `/tmp/${document.metadata.title || 'Untitled'}.md`;
  if (saveAs) {
    document.metadata = {
      ...document.metadata,
      path: targetPath,
      title: targetPath.split(/[\\/]/u).pop() ?? document.metadata.title,
    };
  }
  document.metadata = {
    ...document.metadata,
    dirty: false,
    status: 'saved',
  };
  promoteRecentFile(targetPath);
  revision += 1;
  emitPatch({
    revision,
    recentFiles: [...recentFiles],
    documents: { upsert: { [requestedDocumentId]: cloneMetadata(document) } },
  });
  return {
    status: 'committed',
    data: {
      documentId: requestedDocumentId,
      writtenContentRevision: document.documentRevision,
      committedProjectionRevision: revision,
      targetPath,
      targetPathAdopted: saveAs,
      lineEndingOutcome: 'preserved-lf',
      bomOutcome: 'absent',
      resyncRequired: false,
    },
  };
}

export function Save(
  requestedDocumentId: string,
  _contentRevision: number,
  _decisionToken: string,
): Promise<MockWriteResult> {
  void _contentRevision;
  void _decisionToken;
  return Promise.resolve(
    writeResultFor(requestedDocumentId, mockSaveResult, false),
  );
}

export function SaveAs(
  requestedDocumentId: string,
  _contentRevision: number,
  _decisionToken: string,
): Promise<MockWriteResult> {
  void _contentRevision;
  void _decisionToken;
  return Promise.resolve(
    writeResultFor(requestedDocumentId, mockSaveAsResult, true),
  );
}

export function SetDocView(
  requestedDocumentId: string,
  input: DocViewInput,
): Promise<VoidResult> {
  const document = documents[requestedDocumentId];
  if (document === undefined) {
    return Promise.resolve(notFound());
  }

  document.metadata = {
    ...document.metadata,
    view: {
      arrangement:
        input.editorVisible && input.previewVisible
          ? 'split'
          : input.editorVisible
            ? 'editor'
            : 'preview',
      editorVisible: input.editorVisible,
      previewVisible: input.previewVisible,
      cursor: { ...input.cursor },
      selection: {
        start: { ...input.selection.start },
        end: { ...input.selection.end },
      },
      scroll: { ...input.scroll },
    },
  };
  revision += 1;
  emitPatch({
    revision,
    documents: { upsert: { [requestedDocumentId]: cloneMetadata(document) } },
  });
  return Promise.resolve({});
}

export function SetUILayout(input: UILayout): Promise<VoidResult> {
  const continuous: UILayout = {
    sidebarWidth: input.sidebarWidth,
    windowHeight: input.windowHeight,
    windowWidth: input.windowWidth,
  };
  const hasContinuous = Object.values(continuous).some(
    (value) => value !== undefined,
  );
  if (hasContinuous) {
    pendingContinuousLayout = {
      ...pendingContinuousLayout,
      ...continuous,
    };
    if (pendingContinuousTimer !== undefined) {
      clearTimeout(pendingContinuousTimer);
    }
    pendingContinuousTimer = setTimeout(() => {
      const acknowledged = pendingContinuousLayout;
      pendingContinuousLayout = undefined;
      pendingContinuousTimer = undefined;
      if (acknowledged === undefined) {
        return;
      }
      layout = { ...layout, ...acknowledged };
      revision += 1;
      emitPatch({ revision, ui: acknowledged });
    }, 250);
  }

  const acknowledged: UILayout = {
    sidebarVisible: input.sidebarVisible,
    viewArrangement: input.viewArrangement,
    windowMaximized: input.windowMaximized,
  };
  if (Object.values(acknowledged).some((value) => value !== undefined)) {
    layout = { ...layout, ...acknowledged };
    revision += 1;
    emitPatch({ revision, ui: acknowledged });
  }
  return Promise.resolve({});
}
