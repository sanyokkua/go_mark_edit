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
});

it('T042 exposes the shell status row as a status landmark', () => {
  render(
    <StatusBar
      cursor={{ lineNumber: 1, column: 1 }}
      encoding="utf-8"
      lineEnding="lf"
      wordCount={0}
    />,
  );

  expect(screen.getByRole('status', { name: 'Document status' })).toBeVisible();
});

// The binding draws no save status and no arrangement label in this row: the
// save status belongs to the title bar (`mockup.html` `.doc-name` … `·
// autosaved`, :594) and the arrangement to the Editor/Split/Preview switch.
// Drawing either here duplicated a control the user already has.
it('T015 keeps the save status out of the row and inside Document details', () => {
  render(
    <StatusBar
      cursor={{ lineNumber: 4, column: 2 }}
      encoding="utf-8"
      lineEnding="lf"
      status="saved"
      wordCount={3}
    />,
  );

  const status = screen.getByRole('status');
  expect(status).not.toHaveTextContent('Saved');
  expect(status.querySelector('[data-status-item="standard"]')).toBeNull();

  fireEvent.click(
    within(status).getByRole('button', { name: 'Document details' }),
  );
  expect(
    within(status).getByRole('region', { name: 'Document details' }),
  ).toHaveTextContent('Saved');
});

it('T015 draws no arrangement label, which the view switch already owns', () => {
  render(
    <StatusBar
      cursor={{ lineNumber: 1, column: 1 }}
      encoding="utf-8"
      lineEnding="lf"
      wordCount={0}
    />,
  );

  const status = screen.getByRole('status');
  expect(status.querySelector('[data-status-item="arrangement"]')).toBeNull();
  expect(status).not.toHaveTextContent('Editor');
  expect(status).not.toHaveTextContent('Split');
  expect(status).not.toHaveTextContent('Preview');
});

it('T063 exposes the backend-authoritative status state on the status landmark', () => {
  render(
    <StatusBar
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

it('reports the transient write, and only while it is in flight', () => {
  const { rerender } = render(
    <StatusBar
      cursor={{ lineNumber: 4, column: 2 }}
      encoding="utf-8"
      lineEnding="lf"
      status="unsaved-changes"
      wordCount={3}
      writeInFlight
    />,
  );

  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Saving');
  expect(status.querySelector('[data-write-in-flight="true"]')).not.toBeNull();

  // At rest the item leaves the row entirely, so the row carries the same
  // items as the binding — which is what parity captures.
  rerender(
    <StatusBar
      cursor={{ lineNumber: 4, column: 2 }}
      encoding="utf-8"
      lineEnding="lf"
      status="unsaved-changes"
      wordCount={3}
    />,
  );
  expect(status).not.toHaveTextContent('Saving');
  expect(status.querySelector('[data-status-item="standard"]')).toBeNull();
});

it('StatusBar responsive detail keeps dropped file facts accessible', () => {
  render(
    <StatusBar
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

it('T108 names why a large document is read-only, per FR-FT-005', () => {
  /*
   * FR-FT-005: a file over 10 MiB and no larger than 50 MiB opens read-only
   * "with a visible reason". Both surfaces rendered the bare word `Read-only`,
   * and the discriminator — `capability` — was projected all the way into the
   * store and read by nothing. The status cannot carry it: `save_status.go`
   * collapses every non-writable capability onto the one status.
   */
  render(
    <StatusBar
      capability="large-read-only"
      cursor={{ lineNumber: 1, column: 1 }}
      encoding="utf-8"
      lineEnding="lf"
      status="read-only"
      wordCount={420_000}
    />,
  );

  const status = screen.getByRole('status', { name: 'Document status' });
  fireEvent.click(
    within(status).getByRole('button', { name: 'Document details' }),
  );
  const details = within(status).getByRole('region', {
    name: 'Document details',
  });
  expect(details).toHaveTextContent('Read-only');
  expect(details).toHaveTextContent('over the 10 MiB editing limit');
});

it('T108 leaves the reason out when the document is writable', () => {
  render(
    <StatusBar
      capability="writable"
      cursor={{ lineNumber: 1, column: 1 }}
      encoding="utf-8"
      lineEnding="lf"
      status="saved"
      wordCount={12}
    />,
  );

  const status = screen.getByRole('status', { name: 'Document status' });
  fireEvent.click(
    within(status).getByRole('button', { name: 'Document details' }),
  );
  expect(
    within(status).getByRole('region', { name: 'Document details' }),
  ).not.toHaveTextContent('10 MiB');
});
