import { createHash } from 'node:crypto';

export const REFERENCE_ADAPTER_VERSION = 'feature-003-reference-adapter-v1';

export const referenceVariants = [
  'base',
  'file-only',
  'file-menu',
  'conflict',
  'move-tab',
] as const;

export type ReferenceVariant = (typeof referenceVariants)[number];

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
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const REFERENCE_ADAPTER_HASH = hash(
  JSON.stringify({ REFERENCE_ADAPTER_VERSION, variantRules }),
);

function assertVariant(variant: string): asserts variant is ReferenceVariant {
  if (!referenceVariants.includes(variant as ReferenceVariant)) {
    throw new Error(`Unsupported reference variant: ${variant}`);
  }
}

/**
 * The adapter is deliberately declarative. It records the reviewed variant
 * and permitted region boundary without rewriting binding HTML/CSS or adding
 * masks. T035 owns the browser-side region mapping for each manifest case.
 */
export function adaptReferenceHtml(
  html: string,
  variant: ReferenceVariant = 'base',
): ReferenceAdapterResult {
  assertVariant(variant);
  const rules = variantRules[variant];
  const marker = `data-reference-variant="${variant}"`;
  const adaptedHtml = html.includes(marker)
    ? html
    : html.replace(/<body\b/u, `<body ${marker}`);
  return {
    adapterHash: REFERENCE_ADAPTER_HASH,
    sourceHash: hash(html),
    variant,
    html: adaptedHtml,
    rules,
  };
}

export function referenceVariantRules(variant: ReferenceVariant): VariantRule {
  return variantRules[variant];
}
