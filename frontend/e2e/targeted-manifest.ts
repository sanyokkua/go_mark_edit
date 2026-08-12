import {
  LOGICAL_CASE_COUNT,
  PARITY_MANIFEST,
  type ParityFamily,
} from './parity/manifest';
import type { SemanticCaptureContext } from './parity/state-contract';

export type TargetedParityEntry = Readonly<{
  readonly key: string;
  readonly family: Extract<ParityFamily, 'editor-split'>;
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
    | 'menu-file'
    | 'menu-settings'
    | 'menu-view'
    | 'menu-about';
  readonly referenceVariant: 'base';
  readonly referenceSelector:
    | '#app.no-assistant .menu'
    | '#m-file'
    | '#m-settings'
    | '#m-view'
    | '#m-about'
    | '#app .ovf-menu';
  readonly actualSelector:
    | '[data-shell-menu]'
    | '[data-viewport-popup="file-menu"]'
    | '[data-viewport-popup="settings-menu"]'
    | '[data-viewport-popup="view-menu"]'
    | '[data-viewport-popup="about-menu"]'
    | '[data-viewport-popup="shell-overflow"]'
    | '[data-viewport-popup="editor-overflow"]';
  readonly editorReferenceSelector: '#app.no-assistant .content';
  readonly editorActualSelector: 'section[aria-label="Editor view"]';
  readonly regionId:
    | 'closed-menubar'
    | 'file-menu'
    | 'settings-menu'
    | 'settings-overflow'
    | 'view-menu'
    | 'about-menu';
  readonly openSurface:
    | 'closed-menubar'
    | 'file-menu'
    | 'settings-menu'
    | 'settings-overflow'
    | 'view-menu'
    | 'about-menu';
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
      referenceVariant: 'base',
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
      referenceVariant: 'base',
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
    throw new Error('T061 targeted View and About manifest must contain two cases');
  }
  for (const entry of TARGETED_VIEW_ABOUT_MANIFEST) {
    if (PARITY_MANIFEST.some(({ key }) => key === entry.key)) {
      throw new Error(
        'T061 targeted case must not enter the unrestricted manifest',
      );
    }
  }
}
