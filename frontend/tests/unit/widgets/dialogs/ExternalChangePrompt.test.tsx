import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ConflictPreview } from '../../../../src/logic/store/appModelTypes';
import ExternalChangePrompt from '../../../../src/ui/widgets/dialogs/ExternalChangePrompt';

jest.mock('../../../../src/ui/components/ConflictDiff', () => ({
    __esModule: true,
    default: () => <div data-conflict-diff />,
}));

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
            lineCount: 2,
            text: 'disk\n',
        },
        readOnly: false,
        yours: {
            byteCount: 5,
            lineCount: 2,
            text: 'mine\n',
        },
        ...overrides,
    };
}

it('ExternalChangePrompt decisions and invalidation', async () => {
    const onDecision = jest.fn(async () => undefined);
    render(<ExternalChangePrompt onDecision={onDecision} open preview={preview()} valid={false} />);

    expect(screen.getByRole('dialog', { name: 'File changed on disk' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeDisabled();
    expect(screen.getByText(/no longer current/iu)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onDecision).toHaveBeenCalledWith('skip'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(onDecision).toHaveBeenCalledWith('skip'));
});

it('shows full-version counts and complete text beyond the old preview bounds', () => {
    const longSide = { byteCount: 5000, lineCount: 31, text: `first\n${'middle\n'.repeat(29)}last` };
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
                yours: { ...longSide, byteCount: 5001, text: `first\n${'middle\n'.repeat(29)}yours` },
            })}
        />,
    );

    expect(screen.getByRole('region', { name: 'Complete file comparison' })).toBeVisible();
    expect(screen.getByText('On disk · 31 lines · 5000 bytes')).toBeVisible();
    expect(screen.getByText('Yours · size when saved · 31 lines · 5001 bytes')).toBeVisible();
    expect(screen.getByText('BOM: absent -> utf-8-bom')).toBeVisible();
    expect(screen.getByText('line endings: lf -> crlf')).toBeVisible();
    expect(screen.getByText('permissions: 0644 -> 0600')).toBeVisible();
});

it('read-only conflict offers Reload from disk plus structural Cancel only with Cancel focused', () => {
    render(<ExternalChangePrompt onDecision={jest.fn()} open preview={preview({ readOnly: true })} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Reload from disk' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Keep mine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
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
                    lineCount: 2,
                    text: 'same\n',
                },
                yours: {
                    byteCount: null,
                    byteCountUnavailableReason: 'normalization-required',
                    lineCount: 2,
                    text: 'same\n',
                },
            })}
        />,
    );

    expect(screen.getByText('File characteristics changed')).toBeVisible();
    expect(screen.getByText('BOM: absent -> utf-8-bom')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Complete file comparison' })).not.toBeInTheDocument();
    expect(screen.getByText('On disk · 2 lines · 5 bytes')).toBeVisible();
    expect(screen.getByText(/Yours.*size unavailable.*line ending normalization/iu)).toBeVisible();
});

// the classified error contract's rule that user-facing copy names only the
// safe basename. It does not prove 's network, telemetry or
// multi-window clauses.
it('names only the safe basename when the backend omits displayName', () => {
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

// they reach the external-change prompt. It does not prove the
// shortest-unique-suffix disambiguation, which the prompt never renders.
it('isolates and escapes the basename it derives from a path', () => {
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
