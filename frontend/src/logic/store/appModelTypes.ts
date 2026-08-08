export interface ActiveBuffer {
  documentId: string;
  content: string;
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
  view: DocumentView;
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

export interface DocViewInput {
  editorVisible: boolean;
  previewVisible: boolean;
  cursor: CursorPosition;
  selection: SelectionRange;
  scroll: ScrollOffsets;
}
