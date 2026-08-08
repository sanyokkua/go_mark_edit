export interface ActiveBuffer {
  documentId: string;
  content: string;
  documentRevision?: number;
  projectionRevision?: number;
}

export const viewArrangements = ['editor', 'split', 'preview'] as const;

export type ViewArrangement = (typeof viewArrangements)[number];

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
}

export interface ScrollOffsets {
  editor: number;
  preview: number;
}

export interface DocumentView {
  arrangement: string;
  editorVisible: boolean;
  previewVisible: boolean;
  cursor: CursorPosition;
  selection: SelectionRange;
  scroll: ScrollOffsets;
}

// DocumentMetadata deliberately excludes canonical document content.
export interface DocumentMetadata {
  documentId: string;
  title: string;
  path: string;
  displayName?: string;
  parentName?: string;
  dirty: boolean;
  encoding: string;
  lineEnding: string;
  wordCount: number;
  contentRevision?: number;
  capability?: string;
  sizeClass?: string;
  detached?: boolean;
  conflictBlocked?: boolean;
  status?: SaveStatus;
  view: DocumentView;
}

export type SaveStatus =
  'not-saved' | 'unsaved-changes' | 'saved' | 'autosaved' | 'read-only';

export type LineEndingOutcome =
  | 'preserved-lf'
  | 'preserved-crlf'
  | 'normalized-lf'
  | 'normalized-crlf'
  | 'new-lf';

export interface CommittedWriteOutcome {
  documentId: string;
  writtenContentRevision: number;
  committedProjectionRevision: number;
  targetPath?: string;
  targetPathAdopted: boolean;
  lineEndingOutcome: LineEndingOutcome;
  bomOutcome: 'preserved' | 'absent';
  resyncRequired: boolean;
}

export type WriteStatus =
  'committed' | 'cancelled' | 'needs-normalization' | 'conflict' | 'refused';

export interface WriteResult {
  status: WriteStatus;
  data?: CommittedWriteOutcome;
  decisionToken?: string;
  proposedEnding?: 'lf' | 'crlf';
  documentRevision?: number;
  conflict?: ConflictPreview;
  error?: ClassifiedError;
}

export interface ConflictPreviewSide {
  text: string;
  lineCount: number;
  byteCount: number;
  truncated: boolean;
}

export interface DiskVersion {
  exists: boolean;
  size: number;
  modifiedUnixNano: number;
  mode: number;
  fileIdentity?: string;
}

export interface ConflictPreview {
  documentId: string;
  path?: string;
  displayName?: string;
  contentRevision: number;
  detectedDiskVersion: DiskVersion;
  onDisk: ConflictPreviewSide;
  yours: ConflictPreviewSide;
  metadataDifferences?: string[];
  readOnly: boolean;
}

export type ConflictStatus =
  | 'unchanged'
  | 'detected'
  | 'reloaded'
  | 'authorized'
  | 'skipped'
  | 'cancelled'
  | 'detached'
  | 'unstable'
  | 'refused';

export interface ConflictResult {
  status: ConflictStatus;
  documentId?: string;
  projectionRevision?: number;
  documentRevision?: number;
  decisionToken?: string;
  activeBuffer?: ActiveBuffer;
  preview?: ConflictPreview;
  error?: ClassifiedError;
}

export interface RecoverySurface {
  persistent: boolean;
  savedOnDisk: boolean;
  commandsBlocked: boolean;
  closeBlocked: boolean;
  message: string;
}

export interface UILayout {
  windowWidth?: number;
  windowHeight?: number;
  windowMaximized?: boolean;
  sidebarVisible?: boolean;
  sidebarWidth?: number;
  viewArrangement?: string;
}

export interface AppStateSnapshot {
  revision: number;
  tabSetRevision?: number;
  applicationVersion?: string;
  documents: Record<string, DocumentMetadata>;
  orderedDocumentIds?: string[];
  activeDocumentId: string | null;
  activeDocument?: string | null;
  recentFiles?: string[];
  canReopenLastFile?: boolean;
  ui: UILayout;
}

export interface AppModelState {
  snapshot: AppStateSnapshot;
  activeBuffer: ActiveBuffer | null;
}

export interface DocumentsPatch {
  upsert?: Record<string, DocumentMetadata>;
  remove?: string[];
}

// AppStatePatch is intentionally content-free: the active buffer never travels in events.
export interface AppStatePatch {
  revision: number;
  tabSetRevision?: number;
  orderedDocumentIds?: string[];
  documents?: DocumentsPatch;
  activeDocumentId?: string | null;
  activeDocument?: { present: boolean; documentId?: string };
  recentFiles?: string[];
  canReopenLastFile?: boolean;
  ui?: UILayout;
}

export type ClassifiedErrorCategory =
  | 'not-found'
  | 'permission-denied'
  | 'io-failure'
  | 'conflict'
  | 'capacity-limit'
  | 'unsupported-input'
  | 'system-command-failure'
  | 'persistence-warning';

export type ClassifiedRemediation =
  | ''
  | 'Retry'
  | 'Reload from disk'
  | 'Keep mine'
  | 'Skip'
  | 'Save to recreate'
  | 'Copy path'
  | 'Cancel';

export interface ClassifiedError {
  category: ClassifiedErrorCategory;
  safeSubject?: string;
  message: string;
  remediation: ClassifiedRemediation;
  documentId?: string;
  dedupKey: string;
}

export interface DocumentTransitionResult {
  data?: ActiveBuffer;
  conflict?: ConflictPreview;
  error?: ClassifiedError;
}

export type TabTransitionStatus =
  'activated' | 'reordered' | 'closed' | 'noop' | 'refused';

export interface TabTransitionResult {
  status: TabTransitionStatus;
  documentId?: string;
  projectionRevision?: number;
  tabSetRevision?: number;
  orderedDocumentIds: string[];
  activeDocumentId?: string;
  activeBuffer?: ActiveBuffer;
  conflict?: ConflictPreview;
  error?: ClassifiedError;
}

export type PathCommandStatus =
  'copied' | 'revealed' | 'unavailable' | 'refused';

export interface PathCommandResult {
  status: PathCommandStatus;
  error?: ClassifiedError;
}

export type OpenStatus = 'cancelled' | 'focused' | 'opened' | 'refused';

export interface OpenResult {
  status: OpenStatus;
  documentId?: string;
  projectionRevision?: number;
  activeBuffer?: ActiveBuffer;
  error?: ClassifiedError;
}

export interface DocViewInput {
  editorVisible: boolean;
  previewVisible: boolean;
  cursor: CursorPosition;
  selection: SelectionRange;
  scroll: ScrollOffsets;
}
