import { EventsEmit } from '../../runtime';

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
      applicationVersion: string;
      documents: Record<string, DocumentMetadata>;
      activeDocumentId: string;
      ui: UILayout;
    };
    activeBuffer: {
      documentId: string;
      content: string;
    };
  };
  error?: WireError;
}

interface VoidResult {
  error?: WireError;
}

interface AppStatePatch {
  revision: number;
  documents?: { upsert?: Record<string, DocumentMetadata>; remove?: string[] };
  activeDocumentId?: string;
  ui?: UILayout;
}

const documentId = 'mock-document';
let revision = 0;
let content = '';
let metadata: DocumentMetadata = {
  documentId,
  title: 'Untitled',
  path: '',
  dirty: false,
  encoding: 'utf-8',
  lineEnding: 'lf',
  wordCount: 0,
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
let layout: UILayout = {
  windowWidth: 1024,
  windowHeight: 768,
  sidebarVisible: true,
};
let pendingContinuousLayout: UILayout | undefined;
let pendingContinuousTimer: ReturnType<typeof setTimeout> | undefined;

function cloneMetadata(): DocumentMetadata {
  return {
    ...metadata,
    view: {
      ...metadata.view,
      cursor: { ...metadata.view.cursor },
      selection: {
        start: { ...metadata.view.selection.start },
        end: { ...metadata.view.selection.end },
      },
      scroll: { ...metadata.view.scroll },
    },
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
  return Promise.resolve({
    data: {
      snapshot: {
        revision,
        applicationVersion: 'dev',
        documents: { [documentId]: cloneMetadata() },
        activeDocumentId: documentId,
        ui: { ...layout },
      },
      activeBuffer: { documentId, content },
    },
  });
}

export function UpdateBuffer(
  requestedDocumentId: string,
  nextContent: string,
): Promise<VoidResult> {
  if (requestedDocumentId !== documentId) {
    return Promise.resolve(notFound());
  }

  content = nextContent;
  metadata = {
    ...metadata,
    dirty: content.length > 0,
    wordCount: content.trim() === '' ? 0 : content.trim().split(/\s+/).length,
  };
  revision += 1;
  emitPatch({
    revision,
    documents: { upsert: { [documentId]: cloneMetadata() } },
  });
  return Promise.resolve({});
}

export function SetDocView(
  requestedDocumentId: string,
  input: DocViewInput,
): Promise<VoidResult> {
  if (requestedDocumentId !== documentId) {
    return Promise.resolve(notFound());
  }

  metadata = {
    ...metadata,
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
    documents: { upsert: { [documentId]: cloneMetadata() } },
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
