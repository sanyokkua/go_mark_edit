import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render } from '@testing-library/react';

import Icon, { type IconName } from '../../../../src/ui/primitives/Icon/Icon';

const iconNames: IconName[] = [
  'add',
  'bold',
  'bullet-list',
  'close',
  'editor',
  'file',
  'heading-1',
  'heading-2',
  'heading-3',
  'image',
  'inline-code',
  'italic',
  'link',
  'more',
  'modified',
  'numbered-list',
  'preview',
  'quote',
  'sidebar',
  'split',
  'strike',
  'table',
  'task-list',
  'assistant',
];

it('uses the shared icon size and stroke tokens with explicit overrides', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/ui/primitives/Icon/Icon.module.css'),
    'utf8',
  );
  expect(css).toContain('width: var(--icon-size)');
  expect(css).toContain('stroke-width: var(--icon-stroke)');

  const { container } = render(<Icon name="file" size={24} stroke={2} />);
  const svg = container.querySelector('svg');
  expect(svg?.style.getPropertyValue('--icon-size')).toBe('24px');
  expect(svg?.style.getPropertyValue('--icon-stroke')).toBe('2');
});

it('renders every local catalogue glyph as a decorative current-color SVG', () => {
  const { container } = render(<Icon name="bold" />);
  const svg = container.querySelector('svg');

  expect(svg).toHaveAttribute('data-icon-name', 'bold');
  expect(svg).toHaveAttribute('width', '15');
  expect(svg).toHaveAttribute('height', '15');
  expect(svg).toHaveAttribute('viewBox', '0 0 15 15');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg?.querySelector('path, circle, rect')).not.toBeNull();

  const sprite = readFileSync(
    resolve(process.cwd(), 'src/ui/icons/file-tab-icons.svg'),
    'utf8',
  );
  for (const name of iconNames) {
    expect(sprite).toContain(`id="icon-${name}"`);
  }
  expect(iconNames).toHaveLength(24);
  expect(sprite).toContain('stroke="currentColor"');
  expect(sprite).toContain('stroke-width="1.75"');
  expect(sprite.replace('http://www.w3.org/2000/svg', '')).not.toMatch(
    /https?:\/\//,
  );
  expect(sprite).not.toMatch(/[\u2600-\u27bf\u{1f300}-\u{1faff}]/u);
});

it('does not expose decorative icon geometry as an accessible name', () => {
  const { container } = render(
    <button type="button" aria-label="Close tab">
      <Icon name="close" />
    </button>,
  );

  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});
