export interface ActiveBuffer {
  documentId: string;
  content: string;
}

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
  dirty: boolean;
  encoding: string;
  lineEnding: string;
  wordCount: number;
  view: DocumentView;
}

export interface UILayout {
  sidebarVisible?: boolean;
  sidebarWidth?: number;
  viewArrangement?: string;
  editorPaneVisible?: boolean;
  previewPaneVisible?: boolean;
  assistantVisible?: boolean;
  assistantWidth?: number;
}

export interface AppStateSnapshot {
  revision: number;
  documents: Record<string, DocumentMetadata>;
  activeDocumentId: string;
  ui: UILayout;
}

export interface AppModelState {
  snapshot: AppStateSnapshot;
  activeBuffer: ActiveBuffer;
}

export interface DocumentsPatch {
  upsert?: Record<string, DocumentMetadata>;
  remove?: string[];
}

// AppStatePatch is intentionally content-free: the active buffer never travels in events.
export interface AppStatePatch {
  revision: number;
  documents?: DocumentsPatch;
  activeDocumentId?: string;
  ui?: UILayout;
}

export interface DocViewInput {
  editorVisible: boolean;
  previewVisible: boolean;
  cursor: CursorPosition;
  selection: SelectionRange;
  scroll: ScrollOffsets;
}
