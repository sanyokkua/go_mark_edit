import {
  LOGICAL_CASE_COUNT,
  PARITY_MANIFEST,
  type ParityFamily,
} from './parity/manifest';
import type { SemanticCaptureContext } from './parity/state-contract';

export type TargetedParityEntry = Readonly<{
  readonly key: string;
  readonly family: Extract<ParityFamily, 'editor-split'>;
  readonly width: 1280;
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
  readonly activeScreen: 'editor-split';
  readonly referenceVariant: 'base';
  readonly referenceSelector: '#app.no-assistant .menu';
  readonly actualSelector: '[data-shell-menu]';
  readonly editorReferenceSelector: '#app.no-assistant .content';
  readonly editorActualSelector: 'section[aria-label="Editor view"]';
  readonly regionId: 'closed-menubar';
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
      implementedActionIds: ['file', 'settings', 'view', 'about'] as const,
    }),
  ),
);

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
}
