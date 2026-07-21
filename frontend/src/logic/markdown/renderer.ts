import { createElement } from 'react';
import type { Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { Schema } from 'hast-util-sanitize';
import type { PluggableList } from 'unified';

interface MarkdownTreeNode {
  children?: MarkdownTreeNode[];
  identifier?: string;
  label?: string;
  type: string;
  value?: string;
}

function isMarkdownTreeNode(value: unknown): value is MarkdownTreeNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

function footnoteLabel(node: MarkdownTreeNode): string {
  return node.label ?? node.identifier ?? '';
}

function suppressFootnotesInNode(node: MarkdownTreeNode): void {
  if (node.type === 'footnoteReference') {
    node.type = 'text';
    node.value = `[^${footnoteLabel(node)}]`;
    delete node.identifier;
    delete node.label;
    delete node.children;
    return;
  }

  if (node.children === undefined) {
    return;
  }

  const replacementChildren: MarkdownTreeNode[] = [];
  for (const child of node.children) {
    if (child.type === 'footnoteDefinition') {
      const definitionChildren = child.children ?? [];
      const [firstDefinitionChild, ...remainingDefinitionChildren] =
        definitionChildren;
      const marker: MarkdownTreeNode = {
        type: 'text',
        value: `[^${footnoteLabel(child)}]: `,
      };

      if (firstDefinitionChild?.type === 'paragraph') {
        firstDefinitionChild.children = [
          marker,
          ...(firstDefinitionChild.children ?? []),
        ];
        replacementChildren.push(
          firstDefinitionChild,
          ...remainingDefinitionChildren,
        );
      } else {
        replacementChildren.push(
          {
            children: [marker],
            type: 'paragraph',
          },
          ...definitionChildren,
        );
      }
      continue;
    }

    replacementChildren.push(child);
  }

  node.children = replacementChildren;
  for (const child of node.children) {
    suppressFootnotesInNode(child);
  }
}

/**
 * Phase 01 fixes the renderer at the GFM tier, but keeps footnote support for
 * the Phase 04 standard-expansion story. The source stays untouched; only the
 * parsed tree is converted back to ordinary literal Markdown text.
 */
function suppressFootnotes(): (tree: unknown) => void {
  return (tree: unknown): void => {
    if (isMarkdownTreeNode(tree)) {
      suppressFootnotesInNode(tree);
    }
  };
}

const attributesWithoutImageSource = { ...(defaultSchema.attributes ?? {}) };
delete attributesWithoutImageSource.img;

/**
 * The Phase 01 preview permits GFM's disabled task-list inputs but removes
 * every Markdown image source before React renders the tree. MarkdownView's
 * component override then presents only the image alt-text fallback.
 */
export const baseGfmSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...attributesWithoutImageSource,
    img: ['alt'],
  },
};

/** Fixed Phase 01 GFM renderer configuration; sanitization must stay last. */
export const baseGfmRemarkPlugins: PluggableList = [
  remarkGfm,
  suppressFootnotes,
];

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
