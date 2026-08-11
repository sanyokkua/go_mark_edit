import { createHash } from 'node:crypto';

export const REFERENCE_ADAPTER_VERSION = 'feature-003-reference-adapter-v2';

export const REFERENCE_ZERO_ASSISTANT_CLASS = 'no-assistant';

export const referenceVariants = [
  'base',
  'file-only',
  'file-menu',
  'conflict',
  'move-tab',
] as const;

export type ReferenceVariant = (typeof referenceVariants)[number];

export const fileOnlyReferenceStates = [
  'empty',
  'first-run',
  'six-file',
] as const;

export type FileOnlyReferenceState =
  (typeof fileOnlyReferenceStates)[number];

export const fileOnlyReferenceRecentFiles = Object.freeze([
  ['parity-recent-06.md', '~/Notes/archive'],
  ['parity-recent-05.md', '~/Notes/archive'],
  ['parity-recent-04.md', '~/Notes/archive'],
  ['parity-recent-03.md', '~/Notes/projects'],
  ['parity-recent-02.md', '~/Notes/projects'],
  ['parity-recent-01.md', '~/Notes/projects'],
] as const);

export type ReferenceStateCondition = Readonly<{
  readonly status: 'supported' | 'unresolved';
  readonly reason?: string;
}>;

/**
 * The historical mockup has a generic save prompt but no distinct
 * normalization prompt. Keep this contract explicit so a behavior-owned
 * state cannot accidentally reuse that neighboring reference capture.
 */
export const unresolvedReferenceStateConditions = Object.freeze({
  'prompt-normalization': Object.freeze({
    status: 'unresolved',
    reason:
      'The immutable binding mockup has no source-backed Normalize line endings? condition.',
  }),
} satisfies Readonly<Record<string, ReferenceStateCondition>>);

export function referenceStateCondition(
  stateId: string,
): ReferenceStateCondition {
  const conditions = unresolvedReferenceStateConditions as Readonly<
    Record<string, ReferenceStateCondition>
  >;
  return conditions[stateId] ?? { status: 'supported' };
}

type VariantRule = Readonly<{
  readonly allowedRegions: readonly string[];
  readonly excludedRegions: readonly string[];
}>;

const variantRules: Readonly<Record<ReferenceVariant, VariantRule>> = {
  base: { allowedRegions: [], excludedRegions: [] },
  'file-only': {
    allowedRegions: ['launcher', 'file-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering'],
  },
  'file-menu': {
    allowedRegions: ['file-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering'],
  },
  conflict: {
    allowedRegions: ['reload-prompt', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering'],
  },
  'move-tab': {
    allowedRegions: ['tab-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering'],
  },
};

export interface ReferenceAdapterResult {
  readonly adapterHash: string;
  readonly sourceHash: string;
  readonly variant: ReferenceVariant;
  readonly html: string;
  readonly rules: VariantRule;
  readonly fileOnlyState?: FileOnlyReferenceState;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const REFERENCE_ADAPTER_HASH = hash(
  JSON.stringify({
    REFERENCE_ADAPTER_VERSION,
    REFERENCE_ZERO_ASSISTANT_CLASS,
    fileOnlyReferenceStates,
    fileOnlyReferenceRecentFiles,
    variantRules,
  }),
);

function assertVariant(variant: string): asserts variant is ReferenceVariant {
  if (!referenceVariants.includes(variant as ReferenceVariant)) {
    throw new Error(`Unsupported reference variant: ${variant}`);
  }
}

function assertFileOnlyState(
  variant: ReferenceVariant,
  state: FileOnlyReferenceState | undefined,
): void {
  if (state !== undefined && variant !== 'file-only') {
    throw new Error(
      'File-only reference state ' + state + ' requires the file-only variant',
    );
  }
}

function adaptFileOnlyLauncher(
  html: string,
  state: FileOnlyReferenceState,
): string {
  if (!html.includes('class="launcher"')) {
    throw new Error('File-only reference requires the launcher source region');
  }
  if (!html.includes('>Open folder…</button>')) {
    throw new Error(
      'File-only reference requires the source Open Folder control',
    );
  }

  const withUnavailableFolder = html.replace(
    '>Open folder…</button>',
    ' disabled aria-disabled="true" data-availability="deferred">Open folder…</button>',
  );
  const recentFileRows = fileOnlyReferenceRecentFiles.map(
    ([name, parent]) =>
      '<div class="r"><svg class="ic"><use href="#i-file"/></svg>' +
      name +
      '<small>' +
      parent +
      '</small></div>',
  );
  const recentContent =
    state === 'six-file'
      ? recentFileRows.join('')
      : '<div class="r" data-no-recent-files="true">No recent files</div>';
  const recentRegion = withUnavailableFolder.match(
    /(<div class="rec">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>)/u,
  );
  if (recentRegion === null) {
    throw new Error('File-only reference recent region is malformed');
  }
  const adaptedRecentRegion =
    recentRegion[1] +
    '<div class="lbl">Recent</div>' +
    recentContent +
    recentRegion[2];
  const adapted = withUnavailableFolder.replace(
    recentRegion[0],
    adaptedRecentRegion,
  );
  if (adapted === withUnavailableFolder) {
    throw new Error('File-only reference recent region was not adapted');
  }
  return adapted;
}

/**
 * The adapter is deliberately declarative. It records the reviewed variant
 * and permitted region boundary and activates the mockup's existing
 * zero-Assistant class without changing the source HTML/CSS values or adding
 * masks. T035 owns the browser-side region mapping for each manifest case.
 */
export function adaptReferenceHtml(
  html: string,
  variant: ReferenceVariant = 'base',
  fileOnlyState?: FileOnlyReferenceState,
): ReferenceAdapterResult {
  assertVariant(variant);
  assertFileOnlyState(variant, fileOnlyState);
  const rules = variantRules[variant];
  const marker = `data-reference-variant="${variant}"`;
  const withVariantMarker = html.includes(marker)
    ? html
    : html.replace(/<body\b/u, `<body ${marker}`);
  const withZeroAssistant = withVariantMarker.replace(
    '<div class="app" id="app">',
    `<div class="app ${REFERENCE_ZERO_ASSISTANT_CLASS}" id="app">`,
  );
  const adaptedHtml =
    variant === 'file-only' && fileOnlyState !== undefined
      ? adaptFileOnlyLauncher(withZeroAssistant, fileOnlyState)
      : withZeroAssistant;
  return {
    adapterHash: REFERENCE_ADAPTER_HASH,
    sourceHash: hash(html),
    variant,
    html: adaptedHtml,
    rules,
    fileOnlyState,
  };
}

export function referenceVariantRules(variant: ReferenceVariant): VariantRule {
  return variantRules[variant];
}
