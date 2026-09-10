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

// Proves: FR-FT-024 (partial — the dialog, Cancel focus and Save; the Discard
// choice is proved by the sibling below)
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

// Proves: FR-FT-024 — the Discard third of "Closing one modified document MUST
// offer Save, Discard, and Cancel". Save and Cancel are proved by the sibling
// above; nothing exercised Discard until T157.
//
// Discard is the only one of the three that destroys work, and it is the one
// whose wiring is easiest to get subtly wrong: the button carries
// `choose(isSingle ? 'discard' : 'discard-all')`, so a single modified document
// answered with `discard-all` would ask the backend to throw away every dirty
// document in the window rather than this one. The multi-target sibling below
// covers the other side of that ternary, so the pair pins the branch.
it('T157 answers a single modified document with the Discard choice', async () => {
  const onChoice = jest.fn(async (): Promise<void> => undefined);
  render(<ClosePrompt onChoice={onChoice} open plan={plan()} />);

  const discard = screen.getByRole('button', { name: 'Discard' });
  expect(discard).toBeVisible();
  expect(discard).toHaveAttribute('data-close-choice', 'discard');
  // The whole-window answer must not be on offer for a single document.
  expect(screen.queryByRole('button', { name: 'Discard all' })).toBeNull();

  fireEvent.click(discard);

  await waitFor(() => expect(onChoice).toHaveBeenCalledWith('discard'));
  expect(onChoice).toHaveBeenCalledTimes(1);
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

/*
 * T138. This case used to be `T045 keeps the parity close prompt locator name
 * while showing the reviewed heading`, and the name it preserved existed only
 * on the parity route: there `ModalShell` moved `role="dialog"` onto the
 * backdrop with `aria-label={title}` and stripped the role, `aria-modal` and
 * `aria-label` off the inner section, so the dialog answered to the title
 * instead of its heading. Production never did that. Asserting the parity name
 * was asserting the divergence, so the case now asserts the opposite: the
 * prompt presents one dialog, with one role and one labelling mechanism, on
 * both routes.
 *
 * `ClosePrompt` itself still substitutes a document-specific heading and a raw
 * untranslated English message on the parity route (`ClosePrompt.tsx:28-32,58,67`).
 * That is the same defect class in a different file, outside T138's named
 * scope, and is filed as T172 — so the heading *text* is deliberately not
 * asserted to match across routes here.
 */
// Proves: FR-FT-047 (partial — only "expose correct roles and accessible
//   names", for the close prompt's dialog element; the catalogue,
//   focus-containment, reduced-motion and token clauses are proven elsewhere)
it('T138 gives the close prompt one dialog element on the parity route and off it', () => {
  const originalUrl = window.location.href;
  const shapeOnRoute = (url: string): Record<string, unknown> => {
    window.history.replaceState({}, '', url);
    const rendered = render(
      <ClosePrompt onChoice={jest.fn()} open plan={plan()} />,
    );
    const dialogs = screen.getAllByRole('dialog');
    const dialog = dialogs[0];
    const shape = {
      dialogCount: dialogs.length,
      tag: dialog.tagName,
      ariaModal: dialog.getAttribute('aria-modal'),
      labelledBy: dialog.getAttribute('aria-labelledby'),
      hasShellMarker: dialog.hasAttribute('data-modal-shell'),
      parentIsBody: dialog.parentElement === document.body,
      backdropIsSibling:
        document.querySelector('[data-modal-backdrop]')?.parentElement ===
        document.body,
    };
    rendered.unmount();
    return shape;
  };

  try {
    const production = shapeOnRoute('/');
    expect(production).toEqual({
      dialogCount: 1,
      tag: 'SECTION',
      ariaModal: 'true',
      labelledBy: 'modal-shell-title',
      hasShellMarker: true,
      parentIsBody: true,
      backdropIsSibling: true,
    });
    expect(
      shapeOnRoute(
        '/?parity-case=state:tab-adjacent-after-close:material-light',
      ),
    ).toEqual(production);
  } finally {
    window.history.replaceState({}, '', originalUrl);
  }
});
