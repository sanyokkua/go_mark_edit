import { createElement } from 'react';
import { defaultUrlTransform, type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { Schema } from 'hast-util-sanitize';
import type { PluggableList } from 'unified';

const attributesWithoutImageSource = { ...(defaultSchema.attributes ?? {}) };
delete attributesWithoutImageSource.img;

/**
 * The Phase 01 preview permits GFM's disabled task-list inputs but removes
 * every Markdown image source before React renders the tree. MarkdownView's
 * component override then presents only the image alt-text fallback.
 */
export const baseGfmSanitizeSchema: Schema = {
  ...defaultSchema,
  // remark-gfm already prefixes generated footnote IDs with `user-content-`.
  // Re-prefixing them here breaks their matching internal href targets.
  clobberPrefix: '',
  attributes: {
    ...attributesWithoutImageSource,
    img: ['alt'],
  },
  // `file:` is retained only so the preview link policy can refuse it with a
  // visible reason. MarkdownView prevents the anchor's default action, while
  // javascript/data remain stripped before they reach the renderer.
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'file'],
  },
};

/**
 * Keep file links visible to the preview policy. React Markdown's default URL
 * transform drops them before rehype-sanitize sees the tree; the policy must
 * be able to name and refuse that target. All other URLs retain the library's
 * default transform, including the javascript/data refusal.
 */
export function previewUrlTransform(value: string): string {
  return /^file:/iu.test(value) ? value : defaultUrlTransform(value);
}

/** Fixed Phase 01 GFM renderer configuration; sanitization must stay last. */
export const baseGfmRemarkPlugins: PluggableList = [remarkGfm];

export const baseGfmRehypePlugins: PluggableList = [
  [rehypeSanitize, baseGfmSanitizeSchema],
];

/**
 * Markdown image URLs are deliberately discarded until the Phase 09 guarded
 * asset and remote-content policy is available. Never spread image props here:
 * doing so could reintroduce a fetchable `src`.
 */
export const markdownComponents: Components = {
  img({ alt }): React.JSX.Element {
    const fallback = alt ?? 'Image unavailable';

    return createElement(
      'span',
      {
        'aria-label': fallback,
        className: 'gme-preview-image-fallback',
        role: 'img',
      },
      fallback,
    );
  },
};
