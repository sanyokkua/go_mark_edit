import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import NormalizationPrompt from './NormalizationPrompt';

it('Normalize line endings prompt focus and resumption', async () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn(async () => undefined);

  render(
    <NormalizationPrompt
      filename="notes.md"
      onCancel={onCancel}
      onConfirm={onConfirm}
      open
      proposedEnding="crlf"
    />,
  );

  expect(screen.getByRole('dialog')).toHaveAccessibleName(
    'Normalize line endings?',
  );
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(
    screen.getByText(/notes\.md.*every line ending.*CRLF/iu),
  ).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Normalize and save' }));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('T015 treats the backdrop as Cancel without adding a suppression choice', () => {
  const onCancel = jest.fn();

  render(
    <NormalizationPrompt
      filename="notes.md"
      onCancel={onCancel}
      onConfirm={jest.fn()}
      open
      proposedEnding="lf"
    />,
  );

  fireEvent.pointerDown(
    document.querySelector('[data-normalization-backdrop]') as HTMLElement,
  );
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
