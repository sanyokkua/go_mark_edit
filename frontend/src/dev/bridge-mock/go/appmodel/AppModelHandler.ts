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
  dirty: boolean;
  encoding: string;
  lineEnding: string;
  wordCount: number;
  status?: string;
  detached?: boolean;
  conflictBlocked?: boolean;
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

function e2eConflictEnabled(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('ft-vs-04')
  );
}

function e2eConflictPreview(document: MockDocument): MockConflictPreview {
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
      byteCount: 6,
      lineCount: 1,
      text: 'disk\n',
      truncated: false,
    },
    path: document.metadata.path || undefined,
    readOnly: false,
    yours: {
      byteCount: 6,
      lineCount: 1,
      text: 'mine\n',
      truncated: false,
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
