import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';

import MarkdownView from './MarkdownView';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

it('STORY-014-AC-2 renders GFM features', () => {
  render(
    <MarkdownView
      source={`| Feature | Status |
| --- | --- |
| table cell | ready |

- [x] Complete task
- [ ] Pending task

~~Struck text~~

<https://example.test/docs>`}
    />,
  );

  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: 'Feature' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'table cell' })).toBeInTheDocument();

  const taskCheckboxes = screen.getAllByRole('checkbox');
  expect(taskCheckboxes).toHaveLength(2);
  expect(taskCheckboxes[0]).toBeChecked();
  expect(taskCheckboxes[0]).toBeDisabled();
  expect(taskCheckboxes[1]).not.toBeChecked();
  expect(taskCheckboxes[1]).toBeDisabled();

  const struckText = screen.getByText('Struck text');
  expect(struckText.tagName).toBe('DEL');
  expect(
    screen.getByRole('link', { name: 'https://example.test/docs' }),
  ).toHaveAttribute('href', 'https://example.test/docs');
});

it('STORY-014-AC-3 (EC-RENDER-6) leaves higher-tier syntax and Mermaid safe', () => {
  render(
    <MarkdownView
      source={`Inline math stays $x^2$ and :note[directive syntax] stays literal.

\`\`\`mermaid
graph TD
  A-->B
\`\`\``}
    />,
  );

  expect(screen.getByText(/\$x\^2\$/)).toBeInTheDocument();
  expect(
    screen.getByText(
      'Inline math stays $x^2$ and :note[directive syntax] stays literal.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/graph TD\s+A-->B/)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('STORY-014-AC-4 (EC-RENDER-5) disables raw HTML and dangerous URLs', () => {
  const { container } = render(
    <MarkdownView
      source={`<button onclick="window.__rawHtmlExecuted = true">Raw control</button>

[Dangerous command](javascript:alert('unsafe'))`}
    />,
  );

  const previewRoot = container.querySelector('.gme-preview');
  const stylesSource = readSource('src/ui/components/MarkdownView.module.css');
  const previewSource = readSource('src/ui/components/MarkdownView.tsx');

  expect(previewRoot).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Raw control' }),
  ).not.toBeInTheDocument();
  expect(window).not.toHaveProperty('__rawHtmlExecuted');
  expect(screen.getByText('Dangerous command')).not.toHaveAttribute('href');
  expect(stylesSource).toContain('var(--preview-font-family)');
  expect(stylesSource).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
  expect(previewSource).not.toContain('style=');
});

it('STORY-014-AC-5 (EC-RENDER-7) blocks document-supplied resource requests', () => {
  const imageSourceDescriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'src',
  );
  const assignedSources: string[] = [];

  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get: imageSourceDescriptor?.get,
    set(value: string): void {
      assignedSources.push(value);
      imageSourceDescriptor?.set?.call(this, value);
    },
  });

  try {
    render(
      <MarkdownView
        source={`![Remote image](https://example.test/preview.png)

![Local image](../preview.png)`}
      />,
    );
  } finally {
    if (imageSourceDescriptor === undefined) {
      delete (HTMLImageElement.prototype as { src?: string }).src;
    } else {
      Object.defineProperty(
        HTMLImageElement.prototype,
        'src',
        imageSourceDescriptor,
      );
    }
  }

  const fallbacks = screen.getAllByRole('img');
  expect(fallbacks).toHaveLength(2);
  expect(fallbacks[0]).toHaveAccessibleName('Remote image');
  expect(fallbacks[0]).not.toHaveAttribute('src');
  expect(fallbacks[1]).toHaveAccessibleName('Local image');
  expect(fallbacks[1]).not.toHaveAttribute('src');
  expect(assignedSources).toEqual([]);
});
