import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';

import StatusBar from './StatusBar';

it('T033 keeps the status surface at one exact 28px row with accessible details', () => {
  const statusStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/components/StatusBar.module.css'),
    'utf8',
  );

  expect(statusStyles).toContain('height: var(--status-bar-min-height)');
  expect(statusStyles).toContain('max-height: var(--status-bar-min-height)');
  expect(statusStyles).toContain('gap: var(--status-bar-gap)');
  expect(statusStyles).toContain(
    'padding-inline: var(--status-bar-padding-inline)',
  );
  expect(statusStyles).toContain('flex-wrap: wrap');
  expect(statusStyles).toContain('max-width: calc(100vw - 16px)');
});

// Proves: STORY-016-AC-1
it('STORY-016-AC-1 renders initial untitled metadata', () => {
  render(
    <StatusBar
      arrangement="split"
      cursor={{ lineNumber: 1, column: 1 }}
      encoding="utf-8"
      lineEnding="lf"
      wordCount={0}
    />,
  );

  const status = screen.getByRole('status', { name: 'Document status' });

  expect(within(status).getByText('Ln 1, Col 1')).toBeVisible();
  expect(within(status).getByText('0 words')).toBeVisible();
  expect(within(status).getByText('UTF-8')).toBeVisible();
  expect(within(status).getByText('LF')).toBeVisible();
  expect(within(status).getByText('Split')).toBeVisible();
});

it('T042 exposes the shell status row as a status landmark', () => {
  render(
    <StatusBar
      arrangement="editor"
      cursor={{ lineNumber: 1, column: 1 }}
      encoding="utf-8"
      lineEnding="lf"
      wordCount={0}
    />,
  );

  expect(screen.getByRole('status', { name: 'Document status' })).toBeVisible();
});

it('T015 renders the authoritative saved status beside document metadata', () => {
  render(
    <StatusBar
      arrangement="editor"
      cursor={{ lineNumber: 4, column: 2 }}
      encoding="utf-8"
      lineEnding="lf"
      status="saved"
      wordCount={3}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('Saved');
});

it('T063 exposes the backend-authoritative status state on the status landmark', () => {
  render(
    <StatusBar
      arrangement="editor"
      autosave
      cursor={{ lineNumber: 4, column: 2 }}
      encoding="utf-8"
      lineEnding="mixed"
      status="read-only"
      readOnly
      wordCount={3}
    />,
  );

  expect(screen.getByRole('status')).toHaveAttribute(
    'data-status-state',
    'read-only',
  );
});

it('shows the write-in-flight state without replacing the authoritative dirty status', () => {
  render(
    <StatusBar
      arrangement="editor"
      cursor={{ lineNumber: 4, column: 2 }}
      encoding="utf-8"
      lineEnding="lf"
      status="unsaved-changes"
      wordCount={3}
      writeInFlight
    />,
  );

  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Unsaved changes');
  expect(status).toHaveTextContent('Saving');
  expect(status.querySelector('[data-write-in-flight="true"]')).not.toBeNull();
});

it('StatusBar responsive detail keeps dropped file facts accessible', () => {
  render(
    <StatusBar
      arrangement="split"
      autosave
      cursor={{ lineNumber: 2, column: 4 }}
      encoding="utf-8"
      lineEnding="mixed"
      readOnly
      status="read-only"
      wordCount={2}
    />,
  );

  const status = screen.getByRole('status', { name: 'Document status' });
  const detailsButton = within(status).getByRole('button', {
    name: 'Document details',
  });
  expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(detailsButton);
  expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
  const details = within(status).getByRole('region', {
    name: 'Document details',
  });
  expect(details).toHaveTextContent('Mixed');
  expect(details).toHaveTextContent('Autosave on');
  expect(details).toHaveTextContent('Read-only');
});
