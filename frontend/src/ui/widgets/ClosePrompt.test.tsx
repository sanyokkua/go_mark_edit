import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ClosePlanSummary } from '../../logic/store/appModelTypes';
import ClosePrompt from './ClosePrompt';

function plan(kind: ClosePlanSummary['kind'] = 'single'): ClosePlanSummary {
  return {
    id: 'close-plan-1',
    kind,
    tabSetRevision: 4,
    status: 'collecting',
    targets: [
      {
        documentId: 'doc-1',
        title: 'notes.md',
        displayName: 'notes.md',
        contentRevision: 3,
        dirty: true,
      },
      ...(kind === 'single'
        ? []
        : [
            {
              documentId: 'doc-2',
              title: 'draft.md',
              displayName: 'draft.md',
              contentRevision: 2,
              dirty: true,
            },
          ]),
    ],
  };
}

it('ClosePrompt complete-plan focus and cancellation', async () => {
  const onChoice = jest.fn(async (): Promise<void> => undefined);
  render(<ClosePrompt onChoice={onChoice} open plan={plan()} />);

  const dialog = screen.getByRole('dialog', {
    name: 'Save changes before closing?',
  });
  expect(dialog).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(screen.getByText('notes.md')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onChoice).toHaveBeenCalledWith('save'));
});

it('ClosePrompt gathers one multi-target choice and maps Escape to Cancel', async () => {
  const onChoice = jest.fn(async (): Promise<void> => undefined);
  render(<ClosePrompt onChoice={onChoice} open plan={plan('right')} />);

  const dialog = screen.getByRole('dialog', {
    name: 'Save changes before closing?',
  });
  expect(screen.getByRole('button', { name: 'Save all' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Discard all' })).toBeVisible();
  expect(screen.getByText('draft.md')).toBeVisible();

  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(onChoice).toHaveBeenCalledWith('cancel'));
});

it('T045 keeps the parity close prompt locator name while showing the reviewed heading', () => {
  const originalUrl = window.location.href;
  window.history.replaceState(
    {},
    '',
    '/?parity-case=state:tab-adjacent-after-close:material-light',
  );
  try {
    render(<ClosePrompt onChoice={jest.fn()} open plan={plan()} />);

    expect(
      screen.getByRole('dialog', { name: 'Save changes before closing?' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Save changes to notes.md?' }),
    ).toBeVisible();
  } finally {
    window.history.replaceState({}, '', originalUrl);
  }
});
