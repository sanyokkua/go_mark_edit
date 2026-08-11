import {
  LOGICAL_CASE_COUNT,
  PARITY_MANIFEST,
  type ParityFamily,
} from './parity/manifest';
import type { SemanticCaptureContext } from './parity/state-contract';

export type TargetedParityEntry = Readonly<{
  readonly key: 'targeted:closed-menubar:1280:minimal-light';
  readonly family: Extract<ParityFamily, 'editor-split'>;
  readonly width: 1280;
  readonly height: 720;
  readonly palette: Readonly<{
    readonly id: 'minimal-light';
    readonly theme: 'minimal';
    readonly mode: 'light';
  }>;
  readonly activeScreen: 'editor-split';
  readonly referenceVariant: 'base';
  readonly referenceSelector: '#app.no-assistant .titlebar';
  readonly actualSelector: 'nav[aria-label="Application actions"]';
  readonly editorReferenceSelector: '#app.no-assistant .content';
  readonly editorActualSelector: 'section[aria-label="Editor view"]';
  readonly regionId: 'closed-menubar';
  readonly implementedActionIds: readonly ['file', 'settings', 'view', 'about'];
}>;

export const TARGETED_MANIFEST: readonly TargetedParityEntry[] = Object.freeze([
  Object.freeze({
    key: 'targeted:closed-menubar:1280:minimal-light',
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
    referenceSelector: '#app.no-assistant .titlebar',
    actualSelector: 'nav[aria-label="Application actions"]',
    editorReferenceSelector: '#app.no-assistant .content',
    editorActualSelector: 'section[aria-label="Editor view"]',
    regionId: 'closed-menubar',
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
  };
}

export function assertTargetedManifestIntegrity(): void {
  if (TARGETED_MANIFEST.length !== 1) {
    throw new Error('T056 targeted manifest must contain one focused case');
  }
  const entry = TARGETED_MANIFEST[0];
  if (entry === undefined) throw new Error('T056 targeted manifest is empty');
  if (PARITY_MANIFEST.some(({ key }) => key === entry.key)) {
    throw new Error(
      'T056 targeted case must not enter the unrestricted manifest',
    );
  }
  if (PARITY_MANIFEST.length !== LOGICAL_CASE_COUNT) {
    throw new Error('T056 must preserve the unrestricted logical case count');
  }
  if (entry.implementedActionIds.length !== 4) {
    throw new Error(
      'T056 closed menubar must declare four implemented actions',
    );
  }
}
