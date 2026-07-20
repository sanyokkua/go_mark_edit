import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';

import App from './App';
import AppShell from './ui/widgets/AppShell';

it('STORY-001-AC-2 renders the blank application root', () => {
  render(<App />);

  expect(screen.getByRole('main')).toBeEmptyDOMElement();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/greet|hello|markdown|document|file/i),
  ).not.toBeInTheDocument();
});

// Proves: STORY-007-AC-1
it('STORY-007-AC-1 preserves the collapsed three-region shell', () => {
  const { unmount } = render(<App />);

  expect(
    screen.getByRole('complementary', { name: 'File explorer' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Document area' }),
  ).toBeEmptyDOMElement();
  expect(screen.getByLabelText('Assistant')).toHaveAttribute('hidden');

  unmount();

  const { rerender } = render(<AppShell assistantVisible={false} />);
  const collapsedAssistant = screen.getByLabelText('Assistant');

  rerender(<AppShell assistantVisible />);

  expect(screen.getByLabelText('Assistant')).toBe(collapsedAssistant);
  expect(collapsedAssistant).not.toHaveAttribute('hidden');
  expect(screen.getByRole('complementary', { name: 'Assistant' })).toBe(
    collapsedAssistant,
  );
  expect(
    screen.getByRole('complementary', { name: 'File explorer' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Document area' }),
  ).toBeInTheDocument();
});

// Proves: STORY-007-AC-3
it('STORY-007-AC-3 keeps the reserved region empty', () => {
  render(<AppShell assistantVisible />);

  const assistant = screen.getByRole('complementary', { name: 'Assistant' });

  expect(assistant).toBeEmptyDOMElement();
  expect(within(assistant).queryByRole('button')).not.toBeInTheDocument();
  expect(within(assistant).queryByRole('textbox')).not.toBeInTheDocument();

  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/AppShell.tsx'),
    'utf8',
  );

  expect(shellSource).not.toMatch(
    /from\s+['"][^'"]*(?:logic\/adapter|wailsjs)[^'"]*['"]/,
  );
  expect(shellSource).not.toMatch(/\b(?:fetch|XMLHttpRequest)\b/);
});
