import { render, screen, within } from '@testing-library/react';

import StatusBar from './StatusBar';

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

  const status = screen.getByRole('contentinfo', { name: 'Document status' });

  expect(within(status).getByText('Ln 1, Col 1')).toBeVisible();
  expect(within(status).getByText('0 words')).toBeVisible();
  expect(within(status).getByText('UTF-8')).toBeVisible();
  expect(within(status).getByText('LF')).toBeVisible();
  expect(within(status).getByText('Split')).toBeVisible();
});
