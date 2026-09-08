export type ActionScope = 'editor' | 'document' | 'window' | 'application';
export type ActionSurface =
  | 'file-menu'
  | 'settings-menu'
  | 'view-menu'
  | 'about-menu'
  | 'toolbar'
  | 'preview'
  | 'overflow'
  | 'context'
  | 'tab-context'
  | 'shortcuts';
export type NativeActionRole = 'clipboard' | 'none';

export type ActionUnavailableReason =
  | 'no-document'
  | 'no-editor'
  | 'deferred'
  | 'modal'
  | 'unsupported'
  | 'barrier'
  | 'limit'
  | 'edge'
  | 'no-recent';

export type ActionId =
  | 'new-file'
  | 'new-window'
  | 'open-file'
  | 'open-folder'
  | 'open-recent'
  | 'reopen'
  | 'next-tab'
  | 'previous-tab'
  | 'save'
  | 'save-as'
  | 'export-pdf'
  | 'close-tab'
  | 'close-others'
  | 'close-right'
  | 'move-tab-left'
  | 'move-tab-right'
  | 'copy-path'
  | 'reveal-in-file-manager'
  | 'exit'
  | 'settings'
  | 'appearance'
  | 'editor-settings'
  | 'default-open-mode'
  | 'markdown-standard'
  | 'autosave'
  | 'format-on-save'
  | 'lint-on-save'
  | 'all-settings'
  | 'view'
  | 'editor'
  | 'split'
  | 'preview'
  | 'refresh-preview'
  | 'toggle-sidebar'
  | 'toggle-assistant'
  | 'line-numbers'
  | 'word-wrap'
  | 'distraction-free-reading'
  | 'fullscreen'
  | 'keyboard-shortcuts'
  | 'open-logs'
  | 'view-github'
  | 'about'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inline-code'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'numbered-list'
  | 'task-list'
  | 'quote'
  | 'link'
  | 'image'
  | 'table'
  | 'format'
  | 'compact'
  | 'lint'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'paste-plain'
  | 'command-palette';

export interface ActionAvailability {
  kind: 'available' | 'deferred';
  reason?: string;
}

export interface ActionEntry {
  readonly id: ActionId;
  readonly labelKey: string;
  readonly accessibilityKey: string;
  readonly scope: ActionScope;
  readonly shortcut?: string;
  readonly shortcutAliases?: readonly string[];
  readonly availability: ActionAvailability;
  readonly surfaces: readonly ActionSurface[];
  readonly surfaceOrder?: Partial<Record<ActionSurface, number>>;
  readonly separatorBefore?: readonly ActionSurface[];
  readonly surfaceLabelKeys?: Partial<Record<ActionSurface, string>>;
  readonly nativeRole: NativeActionRole;
}

export interface ProjectedActionDocument {
  readonly capability?: string;
  readonly detached?: boolean;
  readonly path?: string;
}

export interface ProjectedActionState {
  readonly activeDocumentId?: string | null;
  readonly canReopenLastFile?: boolean;
  readonly documents?: Readonly<Record<string, ProjectedActionDocument>>;
  readonly orderedDocumentIds?: readonly string[];
  readonly recentFiles?: readonly string[];
}

export interface ActionAvailabilityContext {
  readonly barrierBlocked?: boolean;
  readonly commandBarrier?: boolean;
  readonly documentId?: string;
  readonly limitReached?: boolean;
  readonly modalOpen?: boolean;
  readonly projectedState?: ProjectedActionState;
  readonly projection?: ProjectedActionState;
  readonly tabLimit?: number;
  readonly tabCommand?: boolean;
  readonly targetDocumentId?: string;
  readonly targetIndex?: number;
  readonly writable?: boolean;
}

export type ResolvedActionAvailability =
  | { kind: 'available' }
  | { kind: 'unavailable'; reason: ActionUnavailableReason };

const available = (): ActionAvailability => ({ kind: 'available' });
const deferred = (reason: string): ActionAvailability => ({
  kind: 'deferred',
  reason,
});

function entry(
  id: ActionId,
  scope: ActionScope,
  surfaces: readonly ActionSurface[],
  options: Partial<
    Pick<
      ActionEntry,
      | 'shortcut'
      | 'shortcutAliases'
      | 'nativeRole'
      | 'availability'
      | 'surfaceOrder'
      | 'separatorBefore'
      | 'surfaceLabelKeys'
    >
  > = {},
): ActionEntry {
  return {
    id,
    labelKey: `action.${id}.label`,
    accessibilityKey: `action.${id}.label`,
    scope,
    surfaces,
    nativeRole: options.nativeRole ?? 'none',
    availability: options.availability ?? available(),
    ...(options.surfaceLabelKeys === undefined
      ? {}
      : { surfaceLabelKeys: options.surfaceLabelKeys }),
    ...(options.surfaceOrder === undefined
      ? {}
      : { surfaceOrder: options.surfaceOrder }),
    ...(options.separatorBefore === undefined
      ? {}
      : { separatorBefore: options.separatorBefore }),
    ...(options.shortcut === undefined ? {} : { shortcut: options.shortcut }),
    ...(options.shortcutAliases === undefined
      ? {}
      : { shortcutAliases: options.shortcutAliases }),
  };
}

const fileDeferred = deferred('file-lifecycle-deferred');
const assistantDeferred = deferred('assistant-deferred');
const laterDeferred = deferred('later-slice');

export const actionRegistry: readonly ActionEntry[] = Object.freeze([
  entry('new-file', 'application', ['file-menu'], {
    shortcut: 'Mod+N',
    availability: available(),
  }),
  entry('new-window', 'application', ['file-menu'], {
    availability: fileDeferred,
  }),
  entry('open-file', 'application', ['file-menu'], {
    shortcut: 'Mod+O',
    surfaceLabelKeys: { 'file-menu': 'action.open-file.file-menu.label' },
    availability: available(),
  }),
  entry('open-folder', 'application', ['file-menu'], {
    surfaceLabelKeys: { 'file-menu': 'action.open-folder.file-menu.label' },
    availability: fileDeferred,
  }),
  entry('open-recent', 'application', ['file-menu']),
  entry('reopen', 'application', ['file-menu'], {
    shortcut: 'Mod+Shift+Alt+T',
  }),
  entry('save', 'document', ['file-menu'], { shortcut: 'Mod+S' }),
  entry('save-as', 'document', ['file-menu'], {
    shortcut: 'Mod+Shift+S',
    surfaceLabelKeys: { 'file-menu': 'action.save-as.file-menu.label' },
  }),
  entry('export-pdf', 'document', ['file-menu'], {
    surfaceLabelKeys: { 'file-menu': 'action.export-pdf.file-menu.label' },
    availability: fileDeferred,
  }),
  entry('close-tab', 'document', ['file-menu', 'tab-context'], {
    shortcut: 'Mod+W',
    availability: available(),
    surfaceOrder: { 'tab-context': 0 },
  }),
  entry('close-others', 'document', ['tab-context'], {
    surfaceOrder: { 'tab-context': 1 },
  }),
  entry('close-right', 'document', ['tab-context'], {
    surfaceOrder: { 'tab-context': 2 },
  }),
  entry('move-tab-left', 'document', ['tab-context'], {
    shortcut: 'Mod+Shift+PageUp',
    surfaceOrder: { 'tab-context': 3 },
  }),
  entry('move-tab-right', 'document', ['tab-context'], {
    shortcut: 'Mod+Shift+PageDown',
    surfaceOrder: { 'tab-context': 4 },
  }),
  entry('copy-path', 'document', ['tab-context'], {
    surfaceOrder: { 'tab-context': 5 },
  }),
  entry('reveal-in-file-manager', 'document', ['tab-context'], {
    surfaceOrder: { 'tab-context': 6 },
  }),
  entry('exit', 'application', ['file-menu'], { availability: available() }),

  entry('settings', 'application', ['settings-menu'], { shortcut: 'Mod+,' }),
  entry('appearance', 'application', ['settings-menu']),
  entry('editor-settings', 'application', ['settings-menu']),
  entry('default-open-mode', 'application', ['settings-menu'], {
    availability: laterDeferred,
  }),
  entry('markdown-standard', 'application', ['settings-menu'], {
    availability: deferred('markdown-standard-later-slice'),
  }),
  entry('autosave', 'application', ['settings-menu'], {
    availability: available(),
  }),
  entry('format-on-save', 'application', ['settings-menu'], {
    availability: laterDeferred,
  }),
  entry('lint-on-save', 'application', ['settings-menu'], {
    availability: laterDeferred,
  }),
  entry('all-settings', 'application', ['settings-menu'], {
    availability: laterDeferred,
  }),

  entry('view', 'window', ['view-menu']),
  entry('editor', 'window', ['view-menu', 'toolbar']),
  entry('split', 'window', ['view-menu', 'toolbar']),
  entry('preview', 'window', ['view-menu', 'toolbar']),
  entry('refresh-preview', 'window', ['preview']),
  entry('toggle-sidebar', 'window', ['view-menu', 'toolbar'], {
    shortcut: 'Mod+\\',
  }),
  entry('toggle-assistant', 'window', ['view-menu', 'toolbar'], {
    availability: assistantDeferred,
  }),
  entry('line-numbers', 'window', ['view-menu', 'overflow']),
  entry('word-wrap', 'window', ['view-menu', 'overflow']),
  entry('distraction-free-reading', 'window', ['view-menu'], {
    availability: laterDeferred,
  }),
  entry('fullscreen', 'window', ['view-menu', 'shortcuts'], {
    shortcut: 'F11',
  }),

  entry('keyboard-shortcuts', 'application', ['about-menu', 'shortcuts'], {
    shortcut: 'Mod+?',
  }),
  entry('open-logs', 'application', ['about-menu'], {
    availability: laterDeferred,
  }),
  entry('view-github', 'application', ['about-menu'], {
    availability: laterDeferred,
  }),
  entry('about', 'application', ['about-menu']),

  entry('bold', 'editor', ['toolbar', 'context', 'shortcuts'], {
    shortcut: 'Mod+B',
    surfaceOrder: { context: 4 },
    separatorBefore: ['context'],
  }),
  entry('italic', 'editor', ['toolbar', 'context', 'shortcuts'], {
    shortcut: 'Mod+I',
    surfaceOrder: { context: 5 },
  }),
  entry('strike', 'editor', ['toolbar', 'shortcuts'], {
    shortcut: 'Mod+Shift+X',
  }),
  entry('inline-code', 'editor', ['toolbar', 'shortcuts'], {
    shortcut: 'Mod+E',
  }),
  entry('heading-1', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+1',
  }),
  entry('heading-2', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+2',
  }),
  entry('heading-3', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+3',
  }),
  entry('bullet-list', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+Shift+8',
  }),
  entry('numbered-list', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+Shift+7',
  }),
  entry('task-list', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+Shift+9',
  }),
  entry('quote', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+Shift+.',
  }),
  entry('link', 'editor', ['toolbar', 'overflow', 'context', 'shortcuts'], {
    shortcut: 'Mod+K',
    surfaceOrder: { context: 6 },
  }),
  entry('image', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+Shift+I',
    availability: deferred('image-lifecycle-deferred'),
  }),
  entry('table', 'editor', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Mod+Shift+T',
  }),
  entry('format', 'document', ['toolbar', 'overflow', 'context', 'shortcuts'], {
    shortcut: 'Alt+Shift+F',
    availability: deferred('formatting-later-slice'),
    surfaceOrder: { context: 7 },
    separatorBefore: ['context'],
    surfaceLabelKeys: { context: 'action.format-document.label' },
  }),
  entry(
    'compact',
    'document',
    ['toolbar', 'overflow', 'context', 'shortcuts'],
    {
      shortcut: 'Alt+Shift+C',
      availability: deferred('tidy-later-slice'),
      surfaceOrder: { context: 8 },
    },
  ),
  entry('lint', 'document', ['toolbar', 'overflow', 'shortcuts'], {
    shortcut: 'Alt+Shift+L',
    availability: deferred('lint-later-slice'),
  }),

  entry('cut', 'editor', ['context'], { nativeRole: 'clipboard' }),
  entry('copy', 'editor', ['context'], { nativeRole: 'clipboard' }),
  entry('paste', 'editor', ['context'], { nativeRole: 'clipboard' }),
  entry('paste-plain', 'editor', ['context'], { nativeRole: 'clipboard' }),
  entry('command-palette', 'window', ['context', 'shortcuts'], {
    availability: deferred('command-palette-deferred'),
    surfaceOrder: { context: 9 },
    separatorBefore: ['context'],
  }),
  entry('next-tab', 'window', ['shortcuts'], {
    shortcut: 'Mod+Tab',
    shortcutAliases: ['Ctrl+PageDown'],
  }),
  entry('previous-tab', 'window', ['shortcuts'], {
    shortcut: 'Mod+Shift+Tab',
    shortcutAliases: ['Ctrl+PageUp'],
  }),
]);

const contextSurfaceOrder: Readonly<Partial<Record<ActionId, number>>> =
  Object.freeze({
    cut: 0,
    copy: 1,
    paste: 2,
    'paste-plain': 3,
  });

const registryById = new Map(
  actionRegistry.map((action) => [action.id, action]),
);

/**
 * The `editor`-scope actions that do not change the buffer.
 *
 * FR-FT-006 makes *editing* unavailable for a read-only document, not the
 * clipboard: lifting text out of a file you cannot write is not editing, so
 * `copy` stays available where `cut`, `paste` and every formatting command do
 * not.
 *
 * Stated as the exceptions rather than as the list of mutations, so an
 * `editor`-scope action added later is gated by default. That is the safe
 * direction — a new mutation silently enabled on an unwritable document
 * corrupts the user's expectation about a file, while a new reader wrongly
 * dimmed is visible the first time anyone looks. T178.
 */
const NON_MUTATING_EDITOR_ACTIONS: ReadonlySet<ActionId> = new Set(['copy']);

const TAB_ACTIONS: ReadonlySet<ActionId> = new Set([
  'close-tab',
  'close-others',
  'close-right',
  'move-tab-left',
  'move-tab-right',
  'copy-path',
  'reveal-in-file-manager',
]);

function projectedStateFor(
  context: ActionAvailabilityContext,
): ProjectedActionState | undefined {
  return context.projectedState ?? context.projection;
}

function projectedDocument(
  context: ActionAvailabilityContext,
): ProjectedActionDocument | undefined {
  const projected = projectedStateFor(context);
  const documentId =
    context.targetDocumentId ??
    context.documentId ??
    projected?.activeDocumentId ??
    undefined;
  return documentId === undefined
    ? undefined
    : projected?.documents?.[documentId];
}

function projectedDocumentId(
  context: ActionAvailabilityContext,
): string | undefined {
  const projected = projectedStateFor(context);
  return (
    context.targetDocumentId ??
    context.documentId ??
    projected?.activeDocumentId ??
    undefined
  );
}

function isAtTabLimit(context: ActionAvailabilityContext): boolean {
  if (context.limitReached === true) return true;
  const projected = projectedStateFor(context);
  const tabLimit = context.tabLimit ?? 40;
  return (
    projected?.orderedDocumentIds !== undefined &&
    projected.orderedDocumentIds.length >= tabLimit
  );
}

function targetIndexFor(
  actionId: ActionId,
  context: ActionAvailabilityContext,
): number | undefined {
  if (context.targetIndex !== undefined) return context.targetIndex;
  const projected = projectedStateFor(context);
  const documentId = projectedDocumentId(context);
  const currentIndex =
    documentId === undefined
      ? -1
      : (projected?.orderedDocumentIds?.indexOf(documentId) ?? -1);
  if (currentIndex < 0) return undefined;
  return currentIndex + (actionId === 'move-tab-left' ? -1 : 1);
}

export function getActionAvailability(
  id: ActionId,
  context: ActionAvailabilityContext = {},
): ResolvedActionAvailability {
  const action = getAction(id);
  if (action.availability.kind === 'deferred') {
    return { kind: 'unavailable', reason: 'deferred' };
  }
  if (context.modalOpen === true) {
    return { kind: 'unavailable', reason: 'modal' };
  }
  if (context.commandBarrier === true || context.barrierBlocked === true) {
    return { kind: 'unavailable', reason: 'barrier' };
  }

  const projected = projectedStateFor(context);
  const orderedDocumentIds = projected?.orderedDocumentIds;
  const documentId = projectedDocumentId(context);
  const document = projectedDocument(context);
  const hasProjectedDocument =
    projected === undefined
      ? undefined
      : documentId !== undefined && document !== undefined;

  if ((id === 'new-file' || id === 'open-file') && isAtTabLimit(context)) {
    return { kind: 'unavailable', reason: 'limit' };
  }
  if (id === 'open-recent') {
    if (
      projected?.recentFiles !== undefined &&
      projected.recentFiles.length === 0
    ) {
      return { kind: 'unavailable', reason: 'no-recent' };
    }
    if (isAtTabLimit(context)) return { kind: 'unavailable', reason: 'limit' };
  }
  if (id === 'reopen') {
    if (projected?.canReopenLastFile === false) {
      return { kind: 'unavailable', reason: 'no-recent' };
    }
    if (isAtTabLimit(context)) return { kind: 'unavailable', reason: 'limit' };
  }

  if (id === 'save' || id === 'save-as') {
    if (context.writable === false) {
      return { kind: 'unavailable', reason: 'no-document' };
    }
    if (hasProjectedDocument === false) {
      return { kind: 'unavailable', reason: 'no-document' };
    }
    if (
      document?.capability !== undefined &&
      document.capability !== 'writable'
    ) {
      return { kind: 'unavailable', reason: 'no-document' };
    }
  }

  /*
   * FR-FT-006: "Editing … MUST be unavailable" when the document opened
   * tolerantly as read-only. Every `editor`-scope action but `copy` changes the
   * buffer, so the capability gates the scope.
   *
   * The predicate is `capability !== 'writable'`, mirroring Go's own
   * (`internal/appmodel/save.go`), rather than a comparison against
   * `unsafe-read-only`: `large-read-only` (FR-FT-005, a file over 10 MiB) is
   * equally unwritable, and matching one string would leave the larger case
   * editable. `reason` is `no-document` for consistency with the `save`/`save-as`
   * capability refusal above; it is never rendered, only branched on in
   * `actionDispatcher`. T178.
   */
  if (
    action.scope === 'editor' &&
    !NON_MUTATING_EDITOR_ACTIONS.has(id) &&
    document?.capability !== undefined &&
    document.capability !== 'writable'
  ) {
    return { kind: 'unavailable', reason: 'no-document' };
  }

  if (TAB_ACTIONS.has(id)) {
    if (hasProjectedDocument === false) {
      return { kind: 'unavailable', reason: 'no-document' };
    }
    if (id === 'copy-path' || id === 'reveal-in-file-manager') {
      if (document?.path === '')
        return { kind: 'unavailable', reason: 'no-document' };
      if (id === 'reveal-in-file-manager' && document?.detached === true) {
        return { kind: 'unavailable', reason: 'no-document' };
      }
    }
    if (
      id === 'close-others' &&
      orderedDocumentIds !== undefined &&
      orderedDocumentIds.length <= 1
    ) {
      return { kind: 'unavailable', reason: 'edge' };
    }
    if (id === 'close-right' && orderedDocumentIds !== undefined) {
      const currentIndex =
        documentId === undefined ? -1 : orderedDocumentIds.indexOf(documentId);
      if (currentIndex < 0 || currentIndex === orderedDocumentIds.length - 1) {
        return { kind: 'unavailable', reason: 'edge' };
      }
    }
    if (id === 'move-tab-left' || id === 'move-tab-right') {
      // A context-menu command may carry an explicit target index before the
      // caller has a full projection. Let the backend validate that command;
      // apply edge checks whenever projected tab order is available.
      if (projected !== undefined) {
        const targetIndex = targetIndexFor(id, context);
        if (
          targetIndex === undefined ||
          orderedDocumentIds === undefined ||
          targetIndex < 0 ||
          targetIndex >= orderedDocumentIds.length
        ) {
          return { kind: 'unavailable', reason: 'edge' };
        }
        const currentIndex =
          documentId === undefined
            ? -1
            : orderedDocumentIds.indexOf(documentId);
        if (targetIndex === currentIndex) {
          return { kind: 'unavailable', reason: 'edge' };
        }
      }
    }
  }

  if (id === 'next-tab' || id === 'previous-tab') {
    if (orderedDocumentIds !== undefined && orderedDocumentIds.length < 2) {
      return { kind: 'unavailable', reason: 'edge' };
    }
    if (projected !== undefined && documentId === undefined) {
      return { kind: 'unavailable', reason: 'no-document' };
    }
  }

  return { kind: 'available' };
}

export function getAction(id: ActionId): ActionEntry {
  const action = registryById.get(id);
  if (action === undefined) {
    throw new Error(`Unknown action identity: ${id}`);
  }
  return action;
}

export function actionsForSurface(
  surface: ActionSurface,
): readonly ActionEntry[] {
  return actionRegistry
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.surfaces.includes(surface))
    .sort((left, right) => {
      const leftOrder =
        left.action.surfaceOrder?.[surface] ??
        (surface === 'context'
          ? contextSurfaceOrder[left.action.id]
          : undefined) ??
        Number.MAX_SAFE_INTEGER;
      const rightOrder =
        right.action.surfaceOrder?.[surface] ??
        (surface === 'context'
          ? contextSurfaceOrder[right.action.id]
          : undefined) ??
        Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ action }) => action);
}
