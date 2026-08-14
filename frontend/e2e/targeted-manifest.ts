import {
  BEHAVIOUR_VERIFIED_STATE_IDS,
  LOGICAL_CASE_COUNT,
  PARITY_MANIFEST,
  type ParityFamily,
} from './parity/manifest';
import type { SemanticCaptureContext } from './parity/state-contract';

export type TargetedParityEntry = Readonly<{
  readonly key: string;
  readonly family: Extract<ParityFamily, 'editor-split' | 'preview-only'>;
  readonly width: 1280 | 375;
  readonly height: 720;
  readonly palette: Readonly<{
    readonly id:
      | 'glass-light'
      | 'glass-dark'
      | 'material-light'
      | 'material-dark'
      | 'minimal-light'
      | 'minimal-dark';
    readonly theme: 'glass' | 'material' | 'minimal';
    readonly mode: 'light' | 'dark';
  }>;
  readonly activeScreen:
    | 'editor-split'
    | 'paused-preview'
    | 'menu-file'
    | 'menu-settings'
    | 'menu-view'
    | 'menu-about';
  readonly referenceVariant: 'base' | 'file-menu' | 'editor-split-375';
  readonly referenceSelector:
    | '#app.no-assistant .menu'
    | '#m-file'
    | '#m-settings'
    | '#m-view'
    | '#m-about'
    | '#app.no-assistant .tabs'
    | '#app.no-assistant .toolbar'
    | '#app .ovf-menu'
    | '#app .pausedbar';
  readonly actualSelector:
    | '[data-shell-menu]'
    | '[data-viewport-popup="file-menu"]'
    | '[data-viewport-popup="settings-menu"]'
    | '[data-viewport-popup="view-menu"]'
    | '[data-viewport-popup="about-menu"]'
    | '[role="tablist"]'
    | '[role="toolbar"][aria-label="Document toolbar"]'
    | '[data-viewport-popup="shell-overflow"]'
    | '[data-viewport-popup="editor-overflow"]'
    | '[data-preview-state="paused"] [role="status"]';
  readonly editorReferenceSelector: '#app.no-assistant .content';
  readonly editorActualSelector: 'section[aria-label="Editor view"]';
  readonly regionId:
    | 'closed-menubar'
    | 'file-menu'
    | 'settings-menu'
    | 'settings-overflow'
    | 'view-menu'
    | 'about-menu'
    | 'tab-strip'
    | 'toolbar'
    | 'preview-paused';
  readonly openSurface:
    | 'closed-menubar'
    | 'file-menu'
    | 'settings-menu'
    | 'settings-overflow'
    | 'view-menu'
    | 'about-menu'
    | 'tab-strip'
    | 'toolbar'
    | 'preview-paused';
  readonly implementedActionIds: readonly ['file', 'settings', 'view', 'about'];
}>;

const TARGETED_PALETTES = [
  { id: 'glass-light', theme: 'glass', mode: 'light' },
  { id: 'glass-dark', theme: 'glass', mode: 'dark' },
  { id: 'material-light', theme: 'material', mode: 'light' },
  { id: 'material-dark', theme: 'material', mode: 'dark' },
  { id: 'minimal-light', theme: 'minimal', mode: 'light' },
  { id: 'minimal-dark', theme: 'minimal', mode: 'dark' },
] as const;

export const TARGETED_MANIFEST: readonly TargetedParityEntry[] = Object.freeze(
  TARGETED_PALETTES.map((palette) =>
    Object.freeze({
      key: `targeted:closed-menubar:1280:${palette.id}`,
      family: 'editor-split',
      width: 1280,
      height: 720,
      palette: Object.freeze(palette),
      activeScreen: 'editor-split',
      referenceVariant: 'base',
      referenceSelector: '#app.no-assistant .menu',
      actualSelector: '[data-shell-menu]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'closed-menubar',
      openSurface: 'closed-menubar',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
  ),
);

export const TARGETED_FILE_MENU_MANIFEST: readonly TargetedParityEntry[] =
  Object.freeze([
    Object.freeze({
      key: 'targeted:file-menu:1280:minimal-light',
      family: 'editor-split',
      width: 1280,
      height: 720,
      palette: Object.freeze({
        id: 'minimal-light',
        theme: 'minimal',
        mode: 'light',
      }),
      activeScreen: 'menu-file',
      referenceVariant: 'file-menu',
      referenceSelector: '#m-file',
      actualSelector: '[data-viewport-popup="file-menu"]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'file-menu',
      openSurface: 'file-menu',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
  ]);

export const TARGETED_SETTINGS_MANIFEST: readonly TargetedParityEntry[] =
  Object.freeze([
    Object.freeze({
      key: 'targeted:settings-menu:1280:minimal-light',
      family: 'editor-split',
      width: 1280,
      height: 720,
      palette: Object.freeze({
        id: 'minimal-light',
        theme: 'minimal',
        mode: 'light',
      }),
      activeScreen: 'menu-settings',
      referenceVariant: 'base',
      referenceSelector: '#m-settings',
      actualSelector: '[data-viewport-popup="settings-menu"]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'settings-menu',
      openSurface: 'settings-menu',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
    Object.freeze({
      key: 'targeted:settings-overflow:375:minimal-light',
      family: 'editor-split',
      width: 375,
      height: 720,
      palette: Object.freeze({
        id: 'minimal-light',
        theme: 'minimal',
        mode: 'light',
      }),
      activeScreen: 'editor-split',
      /*
       * T076/T078 (spec.md, Clarifications, Session 2026-08-14): at the native
       * minimum window the application shows exactly one pane and Split
       * collapses to the editor, while the binding stacks both panes
       * (`mockup.html:54-55`). The reference variant hides the non-selected
       * pane using the binding's own `#pane-preview{display:none}` declaration
       * (`mockup.html:299`), so both pages draw the editor alone.
       */
      referenceVariant: 'editor-split-375',
      referenceSelector: '#app .ovf-menu',
      actualSelector: '[data-viewport-popup="editor-overflow"]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'settings-overflow',
      openSurface: 'settings-overflow',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
  ]);

export const TARGETED_VIEW_ABOUT_MANIFEST: readonly TargetedParityEntry[] =
  Object.freeze([
    Object.freeze({
      key: 'targeted:view-menu:1280:minimal-light',
      family: 'editor-split',
      width: 1280,
      height: 720,
      palette: Object.freeze({
        id: 'minimal-light',
        theme: 'minimal',
        mode: 'light',
      }),
      activeScreen: 'menu-view',
      referenceVariant: 'base',
      referenceSelector: '#m-view',
      actualSelector: '[data-viewport-popup="view-menu"]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'view-menu',
      openSurface: 'view-menu',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
    Object.freeze({
      key: 'targeted:about-menu:1280:minimal-light',
      family: 'editor-split',
      width: 1280,
      height: 720,
      palette: Object.freeze({
        id: 'minimal-light',
        theme: 'minimal',
        mode: 'light',
      }),
      activeScreen: 'menu-about',
      referenceVariant: 'base',
      referenceSelector: '#m-about',
      actualSelector: '[data-viewport-popup="about-menu"]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'about-menu',
      openSurface: 'about-menu',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
  ]);

export const TARGETED_TAB_MANIFEST: readonly TargetedParityEntry[] =
  Object.freeze([
    Object.freeze({
      key: 'targeted:tab-strip:1280:minimal-light',
      family: 'editor-split',
      width: 1280,
      height: 720,
      palette: Object.freeze({
        id: 'minimal-light',
        theme: 'minimal',
        mode: 'light',
      }),
      activeScreen: 'editor-split',
      referenceVariant: 'base',
      referenceSelector: '#app.no-assistant .tabs',
      actualSelector: '[role="tablist"]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'tab-strip',
      openSurface: 'tab-strip',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
  ]);

/*
 * The toolbar was never compared. T062 is named "tabs and toolbar" but its
 * region is `.tabs` / `[role="tablist"]` alone, so the toolbar's own geometry —
 * including where the arrangement segment sits in it — had no comparison at
 * all. That is the region the mispositioned arrangement segment hid in.
 */
export const TARGETED_TOOLBAR_MANIFEST: readonly TargetedParityEntry[] =
  Object.freeze([
    Object.freeze({
      key: 'targeted:toolbar:1280:minimal-light',
      family: 'editor-split',
      width: 1280,
      height: 720,
      palette: Object.freeze({
        id: 'minimal-light',
        theme: 'minimal',
        mode: 'light',
      }),
      activeScreen: 'editor-split',
      referenceVariant: 'base',
      referenceSelector: '#app.no-assistant .toolbar',
      actualSelector: '[role="toolbar"][aria-label="Document toolbar"]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'toolbar',
      openSurface: 'toolbar',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
  ]);

export const TARGETED_PREVIEW_MANIFEST: readonly TargetedParityEntry[] =
  Object.freeze([
    Object.freeze({
      key: 'state:preview-paused:1280:minimal-light',
      family: 'editor-split',
      width: 1280,
      height: 720,
      palette: Object.freeze({
        id: 'minimal-light',
        theme: 'minimal',
        mode: 'light',
      }),
      activeScreen: 'paused-preview',
      referenceVariant: 'base',
      referenceSelector: '#app .pausedbar',
      actualSelector: '[data-preview-state="paused"] [role="status"]',
      editorReferenceSelector: '#app.no-assistant .content',
      editorActualSelector: 'section[aria-label="Editor view"]',
      regionId: 'preview-paused',
      openSurface: 'preview-paused',
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
  ]);

export function contextForTargetedEntry(
  entry: TargetedParityEntry,
  referenceSourceHash: string,
): SemanticCaptureContext {
  return {
    referenceVariant: entry.referenceVariant,
    referenceSourceHash,
    family: entry.family,
    activeScreen: entry.activeScreen,
    implementedActionIds: entry.implementedActionIds,
    viewport: { width: entry.width, height: entry.height },
  };
}

function allTargetedEntries(): readonly TargetedParityEntry[] {
  return [
    ...TARGETED_MANIFEST,
    ...TARGETED_FILE_MENU_MANIFEST,
    ...TARGETED_SETTINGS_MANIFEST,
    ...TARGETED_TAB_MANIFEST,
    ...TARGETED_TOOLBAR_MANIFEST,
    ...TARGETED_VIEW_ABOUT_MANIFEST,
    ...TARGETED_PREVIEW_MANIFEST,
  ];
}

export function assertTargetedManifestIntegrity(): void {
  if (TARGETED_MANIFEST.length !== TARGETED_PALETTES.length) {
    throw new Error('T058 targeted manifest must cover six palettes');
  }
  for (const entry of TARGETED_MANIFEST) {
    if (PARITY_MANIFEST.some(({ key }) => key === entry.key)) {
      throw new Error(
        'T058 targeted case must not enter the unrestricted manifest',
      );
    }
    if (entry.implementedActionIds.length !== 4) {
      throw new Error(
        'T058 closed menubar must declare four implemented actions',
      );
    }
  }
  if (TARGETED_TOOLBAR_MANIFEST.length !== 1) {
    throw new Error('T077 toolbar slice must declare exactly one case');
  }
  for (const entry of TARGETED_TOOLBAR_MANIFEST) {
    if (PARITY_MANIFEST.some(({ key }) => key === entry.key)) {
      throw new Error(
        'T077 toolbar case must not enter the unrestricted manifest',
      );
    }
  }
  if (PARITY_MANIFEST.length !== LOGICAL_CASE_COUNT) {
    throw new Error('T058 must preserve the unrestricted logical case count');
  }
  if (TARGETED_FILE_MENU_MANIFEST.length !== 1) {
    throw new Error('T059 targeted manifest must contain one File popup case');
  }
  const fileMenuEntry = TARGETED_FILE_MENU_MANIFEST[0];
  if (
    fileMenuEntry === undefined ||
    fileMenuEntry.regionId !== 'file-menu' ||
    fileMenuEntry.palette.id !== 'minimal-light'
  ) {
    throw new Error('T059 targeted File popup case is malformed');
  }
  if (
    PARITY_MANIFEST.some(({ key }) =>
      TARGETED_FILE_MENU_MANIFEST.some((entry) => entry.key === key),
    )
  ) {
    throw new Error(
      'T059 targeted case must not enter the unrestricted manifest',
    );
  }
  if (TARGETED_SETTINGS_MANIFEST.length !== 2) {
    throw new Error('T060 targeted Settings manifest must contain two cases');
  }
  for (const entry of TARGETED_SETTINGS_MANIFEST) {
    if (PARITY_MANIFEST.some(({ key }) => key === entry.key)) {
      throw new Error(
        'T060 targeted case must not enter the unrestricted manifest',
      );
    }
  }
  if (TARGETED_VIEW_ABOUT_MANIFEST.length !== 2) {
    throw new Error(
      'T061 targeted View and About manifest must contain two cases',
    );
  }
  for (const entry of TARGETED_VIEW_ABOUT_MANIFEST) {
    if (PARITY_MANIFEST.some(({ key }) => key === entry.key)) {
      throw new Error(
        'T061 targeted case must not enter the unrestricted manifest',
      );
    }
  }
  if (TARGETED_TAB_MANIFEST.length !== 1) {
    throw new Error('T062 targeted tab manifest must contain one case');
  }
  for (const entry of TARGETED_TAB_MANIFEST) {
    if (PARITY_MANIFEST.some(({ key }) => key === entry.key)) {
      throw new Error(
        'T062 targeted case must not enter the unrestricted manifest',
      );
    }
  }
  if (TARGETED_PREVIEW_MANIFEST.length !== 1) {
    throw new Error('T064 targeted preview manifest must contain one case');
  }
  for (const entry of TARGETED_PREVIEW_MANIFEST) {
    if (PARITY_MANIFEST.some(({ key }) => key === entry.key)) {
      throw new Error(
        'T064 targeted case must not enter the unrestricted manifest',
      );
    }
  }
  /*
   * T063: no editor-status state pixel-compares, so none of them may appear as
   * a targeted comparison case. They are behaviour-verified in
   * `targeted-parity.test.ts` against `data-status-state` and the title bar.
   */
  for (const entry of allTargetedEntries()) {
    for (const stateId of BEHAVIOUR_VERIFIED_STATE_IDS) {
      if (entry.key.startsWith(`state:${stateId}:`)) {
        throw new Error(
          `T063 behaviour-verified state ${stateId} must not be a targeted comparison case`,
        );
      }
    }
  }
  /*
   * T076/T078: at the native minimum window the application shows one pane and
   * Split collapses to the editor, while the binding stacks both panes
   * (`mockup.html:54-55`). Every `editor-split` capture at 375 therefore has to
   * run against the reference variant that hides the non-selected pane.
   */
  for (const entry of allTargetedEntries()) {
    const narrowEditorSplit =
      entry.family === 'editor-split' && entry.width === 375;
    if (narrowEditorSplit && entry.referenceVariant !== 'editor-split-375') {
      throw new Error(
        `T076 editor-split case ${entry.key} at 375 must use the editor-split-375 reference variant`,
      );
    }
    if (!narrowEditorSplit && entry.referenceVariant === 'editor-split-375') {
      throw new Error(
        `T076 reference variant editor-split-375 is only for editor-split at 375, not ${entry.key}`,
      );
    }
  }
}
