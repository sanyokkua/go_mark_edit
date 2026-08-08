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
  | 'shortcuts';
export type NativeActionRole = 'clipboard' | 'none';

export type ActionId =
  | 'new-file'
  | 'new-window'
  | 'open-file'
  | 'open-folder'
  | 'open-recent'
  | 'reopen'
  | 'save'
  | 'save-as'
  | 'export-pdf'
  | 'close-tab'
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
  readonly availability: ActionAvailability;
  readonly surfaces: readonly ActionSurface[];
  readonly surfaceOrder?: Partial<Record<ActionSurface, number>>;
  readonly separatorBefore?: readonly ActionSurface[];
  readonly surfaceLabelKeys?: Partial<Record<ActionSurface, string>>;
  readonly nativeRole: NativeActionRole;
}

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
  };
}

const fileDeferred = deferred('file-lifecycle-deferred');
const tabDeferred = deferred('tab-lifecycle-deferred');
const assistantDeferred = deferred('assistant-deferred');
const laterDeferred = deferred('later-slice');

export const actionRegistry: readonly ActionEntry[] = Object.freeze([
  entry('new-file', 'application', ['file-menu'], {
    availability: available(),
  }),
  entry('new-window', 'application', ['file-menu'], {
    availability: fileDeferred,
  }),
  entry('open-file', 'application', ['file-menu'], {
    availability: available(),
  }),
  entry('open-folder', 'application', ['file-menu'], {
    availability: fileDeferred,
  }),
  entry('open-recent', 'application', ['file-menu'], {
    availability: fileDeferred,
  }),
  entry('reopen', 'application', ['file-menu'], { availability: fileDeferred }),
  entry('save', 'document', ['file-menu']),
  entry('save-as', 'document', ['file-menu']),
  entry('export-pdf', 'document', ['file-menu'], {
    availability: fileDeferred,
  }),
  entry('close-tab', 'document', ['file-menu'], { availability: tabDeferred }),
  entry('exit', 'application', ['file-menu'], { availability: fileDeferred }),

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
    availability: laterDeferred,
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
