import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import Segmented from './Segmented';

const options = [
  { label: 'Editor', value: 'editor' },
  { label: 'Split', value: 'split' },
  { label: 'Preview', value: 'preview' },
] as const;

const SegmentedHarness: React.FC = (): React.JSX.Element => {
  const [value, setValue] =
    useState<(typeof options)[number]['value']>('editor');

  return (
    <Segmented
      ariaLabel="View arrangement"
      options={options}
      value={value}
      onChange={setValue}
    />
  );
};

// Proves: FR-043
it('owns roving radio focus for Arrow, Home and End keys', () => {
  render(<SegmentedHarness />);

  const editor = screen.getByRole('radio', { name: 'Editor' });
  editor.focus();
  fireEvent.keyDown(editor, { key: 'End' });

  const preview = screen.getByRole('radio', { name: 'Preview' });
  expect(preview).toBeChecked();
  expect(preview).toHaveFocus();

  fireEvent.keyDown(preview, { key: 'Home' });
  expect(editor).toBeChecked();
  expect(editor).toHaveFocus();

  fireEvent.keyDown(editor, { key: 'ArrowRight' });
  expect(screen.getByRole('radio', { name: 'Split' })).toBeChecked();
});
