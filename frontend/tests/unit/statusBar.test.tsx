import { fireEvent, render, screen, within } from '@testing-library/react';

import StatusBar, { type StatusFact } from '../../src/ui/components/StatusBar';

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

    fireEvent.click(
      within(status).getByRole('button', { name: 'Document details' }),
    );
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
