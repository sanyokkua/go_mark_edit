import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ConflictPreview } from '../../../logic/store/appModelTypes';
import ExternalChangePrompt from './ExternalChangePrompt';

function preview(overrides: Partial<ConflictPreview> = {}): ConflictPreview {
  return {
    contentRevision: 4,
    detectedDiskVersion: {
      exists: true,
      mode: 0o644,
      modifiedUnixNano: '2',
      size: 16,
    },
    displayName: 'notes.md',
    documentId: 'doc-1',
    onDisk: {
      byteCount: 5,
      lineCount: 1,
      text: 'disk\n',
      truncated: false,
    },
    readOnly: false,
    yours: {
      byteCount: 5,
      lineCount: 1,
      text: 'mine\n',
      truncated: false,
    },
    ...overrides,
  };
}

it('ExternalChangePrompt decisions and invalidation', async () => {
  const onDecision = jest.fn(async () => undefined);
  render(
    <ExternalChangePrompt
      onDecision={onDecision}
      open
      preview={preview()}
      valid={false}
    />,
  );

  expect(
    screen.getByRole('dialog', { name: 'File changed on disk' }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Skip' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Keep mine' })).toBeDisabled();
  expect(screen.getByText(/no longer current/iu)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('skip'));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('skip'));
});

it('conflict preview enforces both 12-line and 4096-byte bounds without splitting a code point', () => {
  const longSide = {
    byteCount: 4096,
    lineCount: 12,
    text: 'bounded preview',
    truncated: true,
  };
  render(
    <ExternalChangePrompt
      onDecision={jest.fn()}
      open
      preview={preview({
        metadataDifferences: [
          'BOM: absent -> utf-8-bom',
          'line endings: lf -> crlf',
          'permissions: 0644 -> 0600',
        ],
        onDisk: longSide,
        yours: { ...longSide, text: 'bounded yours' },
      })}
    />,
  );

  expect(
    screen.getByRole('region', { name: 'First changed hunk' }),
  ).toBeVisible();
  expect(screen.getAllByText(/Truncated at 12 logical lines/iu)).toHaveLength(
    2,
  );
  expect(screen.getByText('bounded preview')).not.toContainHTML('\uFFFD');
  expect(screen.getByText('BOM: absent -> utf-8-bom')).toBeVisible();
  expect(screen.getByText('line endings: lf -> crlf')).toBeVisible();
  expect(screen.getByText('permissions: 0644 -> 0600')).toBeVisible();
});

it('read-only conflict offers Reload from disk plus structural Cancel only with Cancel focused', () => {
  render(
    <ExternalChangePrompt
      onDecision={jest.fn()}
      open
      preview={preview({ readOnly: true })}
    />,
  );

  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(
    screen.getByRole('button', { name: 'Reload from disk' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Keep mine' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Skip' }),
  ).not.toBeInTheDocument();
});

it('metadata-only conflict shows characteristic differences', () => {
  render(
    <ExternalChangePrompt
      onDecision={jest.fn()}
      open
      preview={preview({
        metadataDifferences: ['BOM: absent -> utf-8-bom'],
        onDisk: {
          byteCount: 5,
          lineCount: 1,
          text: 'same\n',
          truncated: false,
        },
        yours: { byteCount: 5, lineCount: 1, text: 'same\n', truncated: false },
      })}
    />,
  );

  expect(screen.getByText('File characteristics changed')).toBeVisible();
  expect(screen.getByText('BOM: absent -> utf-8-bom')).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'First changed hunk' }),
  ).not.toBeInTheDocument();
});

// Proves: FR-FT-048 (the "no private full paths in errors" clause only), and
// the classified error contract's rule that user-facing copy names only the
// safe basename. It does not prove FR-FT-048's network, telemetry or
// multi-window clauses.
it('T146 names only the safe basename when the backend omits displayName', () => {
  const canonicalPath = '/Users/someone/Private/Journal/notes.md';
  render(
    <ExternalChangePrompt
      onDecision={jest.fn()}
      open
      preview={preview({ displayName: undefined, path: canonicalPath })}
    />,
  );

  const message = screen.getByText(/changed outside GoMarkEdit/u);
  expect(message).toBeVisible();
  expect(message.textContent).not.toContain(canonicalPath);
  expect(message.textContent).not.toContain('/Users/someone');
  expect(message.textContent).toContain('notes.md');
});

// Proves: FR-FT-035's directional-isolation and control-character clauses as
// they reach the external-change prompt. It does not prove the
// shortest-unique-suffix disambiguation, which the prompt never renders.
it('T146 isolates and escapes the basename it derives from a path', () => {
  render(
    <ExternalChangePrompt
      onDecision={jest.fn()}
      open
      preview={preview({
        displayName: undefined,
        path: '/tmp/reports/re‮gnp.md',
      })}
    />,
  );

  const message = screen.getByText(/changed outside GoMarkEdit/u);
  expect(message.textContent).not.toContain('‮');
  expect(message.textContent).toContain('⁨re\\u202Egnp.md⁩');
});

it('truncated side is visibly identified', () => {
  render(
    <ExternalChangePrompt
      onDecision={jest.fn()}
      open
      preview={preview({
        onDisk: {
          byteCount: 4096,
          lineCount: 12,
          text: 'truncated disk',
          truncated: true,
        },
      })}
    />,
  );

  expect(
    document.querySelector('[data-conflict-truncated="onDisk"]'),
  ).toBeVisible();
});
