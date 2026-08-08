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
type DocumentTransitionResult = Pick<
  apperr.DocumentTransitionResult,
  'data' | 'error'
>;
type OpenResult = Pick<
  apperr.OpenResult,
  'status' | 'documentId' | 'projectionRevision' | 'activeBuffer' | 'error'
>;

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
  dirty: boolean;
  encoding: string;
  lineEnding: string;
  wordCount: number;
  status?: string;
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
      ui: UILayout;
    };
    activeBuffer: ActiveBufferResult;
  };
  error?: WireError;
}

interface VoidResult {
  error?: WireError;
}

interface AppStatePatch {
  revision: number;
  tabSetRevision?: number;
  orderedDocumentIds?: string[];
  documents?: { upsert?: Record<string, DocumentMetadata>; remove?: string[] };
  activeDocumentId?: string;
  ui?: UILayout;
}

interface MockOpenSelection {
  path: string;
  content?: string;
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

const initialDocumentId = 'mock-document';
let revision = 0;
let tabSetRevision = 0;
let orderedDocumentIds: string[] = [initialDocumentId];
let activeDocumentId = initialDocumentId;
let nextUntitledNumber = 2;
let openSelection: MockOpenSelection | null = null;
let mockSaveResult: MockWriteResult | undefined;
let mockSaveAsResult: MockWriteResult | undefined;
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

function initialDocuments(): Record<string, MockDocument> {
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

function activeBuffer(document: MockDocument): ActiveBufferResult {
  return {
    documentId: document.metadata.documentId,
    documentRevision: document.documentRevision,
    projectionRevision: revision,
    content: document.content,
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
  orderedDocumentIds = [initialDocumentId];
  activeDocumentId = initialDocumentId;
  nextUntitledNumber = 2;
  openSelection = null;
  mockSaveResult = undefined;
  mockSaveAsResult = undefined;
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

function selectedDocumentId(path: string): string {
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

  const documentId = selectedDocumentId(selection.path);
  const existing = documents[documentId];
  if (existing !== undefined) {
    activeDocumentId = documentId;
    revision += 1;
    emitPatch({ revision, activeDocumentId: documentId });
    return Promise.resolve({
      status: 'focused',
      documentId,
      projectionRevision: revision,
      activeBuffer: activeBuffer(existing),
    });
  }

  const document: MockDocument = {
    metadata: newDocumentMetadata(documentId, documentId, selection.path),
    content: selection.content ?? `# ${documentId}`,
    documentRevision: 0,
  };
  document.metadata.wordCount = document.content.trim().split(/\s+/).length;
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
  revision += 1;
  emitPatch({
    revision,
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
