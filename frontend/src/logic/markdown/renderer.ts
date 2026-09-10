import { createElement } from 'react';
import { defaultUrlTransform, type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { Schema } from 'hast-util-sanitize';
import type { PluggableList } from 'unified';

/**
 * The preview keeps the sanitized image source available to MarkdownView's
 * props-only policy seam. The component never spreads it into the DOM unless
 * PreviewPane has classified it as a bounded local asset route.
 */
export const baseGfmSanitizeSchema: Schema = {
  ...defaultSchema,
  // remark-gfm already prefixes generated footnote IDs with `user-content-`.
  // Re-prefixing them here breaks their matching internal href targets.
  clobberPrefix: '',
  attributes: {
    ...defaultSchema.attributes,
    img: ['alt', 'src'],
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
 * Image sources are passed to MarkdownView only as sanitized data. Never
 * spread image props here: doing so could reintroduce a fetchable remote src.
 */
export function renderImageFallback(alt?: string): React.JSX.Element {
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
}

export const markdownComponents: Components = {
  img({ alt }): React.JSX.Element {
    return renderImageFallback(alt);
  },
};
