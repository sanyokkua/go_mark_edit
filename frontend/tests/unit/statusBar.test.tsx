import { fireEvent, render, screen, within } from '@testing-library/react';

import StatusBar, { type StatusFact } from '../../src/ui/components/StatusBar';

it('exposes the document status and details control without overriding a footer role', () => {
    render(<StatusBar />);
    const status = screen.getByRole('status', { name: 'Document status' });
    expect(status.matches('footer[role="status"]')).toBe(false);
    expect(within(status).getByRole('button', { name: 'Document details' })).toBeEnabled();
});

it('omits the legacy Markdown standard until it is supplied', () => {
    render(<StatusBar saveIdentity="Saved" />);
    const status = screen.getByRole('status');
    expect(status.querySelector('[data-status-item="standard-kind"]')).toBeNull();
});

it('sorts status facts by priority and keeps dropped facts in document details', () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 375,
    });
    const facts: StatusFact[] = [
        {
            id: 'words',
            rowLabel: '2 words',
            detailLabel: 'Words',
            value: '2',
            dropPriority: 2,
        },
        {
            id: 'cursor',
            rowLabel: 'Ln 2, Col 4',
            detailLabel: 'Cursor',
            value: 'Ln 2, Col 4',
            dropPriority: 1,
        },
        {
            id: 'standard',
            rowLabel: 'Markdown · GFM',
            detailLabel: 'Standard',
            value: 'GFM',
            dropPriority: 0,
        },
    ];

    try {
        render(<StatusBar facts={facts} saveIdentity="Saved" />);

        const status = screen.getByRole('status');
        expect(
            Array.from(status.querySelectorAll('[data-status-item]')).map((item) =>
                item.getAttribute('data-status-item'),
            ),
        ).toEqual(['standard', 'cursor']);

        fireEvent.click(within(status).getByRole('button', { name: 'Document details' }));
        const details = screen.getByRole('region', { name: 'Document details' });
        expect(details).toHaveTextContent('Words: 2');
        expect(details).toHaveTextContent('Saved');
    } finally {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: previousWidth,
        });
    }
});

it('fits facts to the row, preserves protected controls and restores moved labels when they fit', () => {
    let rowWidth = 600;
    const measurements = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
    ) {
        if (this.getAttribute('role') === 'status') return new DOMRect(0, 0, rowWidth);
        if (this.getAttribute('aria-controls') === 'document-status-details') return new DOMRect(0, 0, 110);
        return new DOMRect(0, 0, (this.textContent?.length ?? 0) * 5);
    });
    const fact = (id: string, rowLabel: string, dropPriority: number): StatusFact => ({
        id,
        rowLabel,
        dropPriority,
        detailLabel: rowLabel,
        value: '',
    });
    const standard = fact('standard-kind', 'Markdown · Erweitert', 0);
    const problems = {
        ...fact('problems', '12.000 Probleme · veraltet', 1),
        onActivate: jest.fn(),
    };
    const cursor = fact('cursor', 'Zl 12, Sp 30', 2);
    const encoding = {
        ...fact('encoding', 'Zeichenkodierung', 2),
        onActivate: jest.fn(),
    };
    const facts = [standard, problems, cursor, encoding];
    const props = { transient: 'Speichert', saveIdentity: 'Gespeichert' };

    try {
        const { rerender } = render(<StatusBar facts={facts} {...props} />);
        const row = screen.getByRole('status');
        const details = within(row).getByRole('button', { name: 'Document details' });
        const encodingButton = within(row).getByRole('button', { name: 'Zeichenkodierung' });
        const visibleFacts = (): (string | null)[] =>
            Array.from(row.querySelectorAll('[data-status-item]'), (item) => item.getAttribute('data-status-item'));
        const resize = (width: number): void => {
            rowWidth = width;
            fireEvent.resize(window);
        };

        encodingButton.focus();
        resize(450);
        expect(visibleFacts()).toEqual(['standard-kind', 'problems', 'cursor', 'standard']);
        expect(within(row).queryByRole('button', { name: 'Zeichenkodierung' })).not.toBeInTheDocument();
        expect(details).toHaveFocus();

        resize(310);
        expect(visibleFacts()).toEqual(['problems', 'standard']);
        expect(within(row).getByRole('button', { name: '12.000 Probleme · veraltet' })).toBeEnabled();
        fireEvent.click(details);
        const popup = screen.getByRole('region', { name: 'Document details' });
        expect(Array.from(popup.querySelectorAll('[data-status-detail]'), (item) => item.textContent)).toEqual([
            'Markdown · Erweitert',
            '12.000 Probleme · veraltet',
            'Zl 12, Sp 30',
            'Zeichenkodierung',
            'Gespeichert',
            'Speichert',
        ]);
        expect(popup.querySelector('[data-status-detail="standard-kind"]')).toHaveAttribute(
            'data-status-detail-dropped',
            'true',
        );

        resize(475);
        const shortEncoding = { ...encoding, rowLabel: 'UTF-8' };
        rerender(<StatusBar facts={[standard, problems, cursor, shortEncoding]} {...props} />);
        expect(visibleFacts()).toEqual(['standard-kind', 'problems', 'cursor', 'encoding', 'standard']);
        expect(within(row).getByRole('button', { name: 'UTF-8' })).toBe(encodingButton);
        expect(popup.querySelector('[data-status-detail="standard-kind"]')).not.toHaveAttribute(
            'data-status-detail-dropped',
        );
    } finally {
        measurements.mockRestore();
    }
});

it('shows why a write-protected document is read-only', () => {
    render(<StatusBar status="read-only" capability="write-protected-read-only" />);
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Document details' }));
    expect(screen.getByRole('region', { name: 'Document details' })).toHaveTextContent(
        'Read-only · The file is write-protected.',
    );
});
