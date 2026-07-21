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
      aria-label="View arrangement"
      options={options}
      value={value}
      onValueChange={setValue}
    />
  );
};

it('STORY-015-AC-5 supports Arrow Home and End selection with stable focus', () => {
  render(<SegmentedHarness />);

  const editor = screen.getByRole('radio', { name: 'Editor' });
  editor.focus();
  expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  expect(editor).toBeChecked();
  expect(editor).toHaveFocus();

  fireEvent.keyDown(editor, { key: 'End' });
  const preview = screen.getByRole('radio', { name: 'Preview' });
  expect(preview).toBeChecked();
  expect(preview).toHaveFocus();

  fireEvent.keyDown(preview, { key: 'Home' });
  expect(editor).toBeChecked();
  expect(editor).toHaveFocus();

  fireEvent.keyDown(editor, { key: 'ArrowRight' });
  const split = screen.getByRole('radio', { name: 'Split' });
  expect(split).toBeChecked();
  expect(split).toHaveFocus();

  fireEvent.keyDown(split, { key: 'ArrowLeft' });
  expect(editor).toBeChecked();
  expect(editor).toHaveFocus();
  expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
});
