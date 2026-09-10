import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import ModalShell from '../../../../src/ui/components/ModalShell/ModalShell';

it('owns the dialog dismissal policy, width and initial focus contract', () => {
  const onRequestClose = jest.fn();
  const initialFocus = createRef<HTMLButtonElement>();
  render(
    <>
      <button type="button">Open</button>
      <ModalShell
        dismiss="backdrop"
        initialFocus={initialFocus}
        onRequestClose={onRequestClose}
        open
        title="Shared dialog"
        width="28rem"
      >
        <button ref={initialFocus} type="button">
          Confirm
        </button>
      </ModalShell>
    </>,
  );

  const dialog = screen.getByRole('dialog', { name: 'Shared dialog' });
  expect(dialog).toHaveStyle({ width: '28rem' });
  expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onRequestClose).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(screen.getByTestId('modal-backdrop'));
  expect(onRequestClose).toHaveBeenCalledTimes(2);
});

it('traps Tab and Shift+Tab inside the dialog', () => {
  render(
    <ModalShell
      dismiss="none"
      onRequestClose={jest.fn()}
      open
      title="Focus dialog"
    >
      <button type="button">First</button>
      <button type="button">Last</button>
    </ModalShell>,
  );

  const first = screen.getByRole('button', { name: 'First' });
  const last = screen.getByRole('button', { name: 'Last' });
  first.focus();
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(first).toHaveFocus();
});

it('uses Escape and backdrop dismissal only when their policy allows it', () => {
  const onRequestClose = jest.fn();
  const { rerender } = render(
    <ModalShell
      dismiss="escape"
      onRequestClose={onRequestClose}
      open
      title="Dismiss dialog"
    >
      <p>Body</p>
    </ModalShell>,
  );

  fireEvent.pointerDown(screen.getByTestId('modal-backdrop'));
  expect(onRequestClose).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onRequestClose).toHaveBeenCalledTimes(1);

  rerender(
    <ModalShell
      dismiss="none"
      onRequestClose={onRequestClose}
      open
      title="Dismiss dialog"
    >
      <p>Body</p>
    </ModalShell>,
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.pointerDown(screen.getByTestId('modal-backdrop'));
  expect(onRequestClose).toHaveBeenCalledTimes(1);
});

it('restores focus to the opener when the shell closes', () => {
  const opener = document.createElement('button');
  opener.textContent = 'Open';
  document.body.append(opener);
  opener.focus();
  const { rerender } = render(
    <ModalShell
      dismiss="escape"
      onRequestClose={jest.fn()}
      open
      title="Restoring dialog"
    >
      <p>Body</p>
    </ModalShell>,
  );

  rerender(
    <ModalShell
      dismiss="escape"
      onRequestClose={jest.fn()}
      open={false}
      title="Restoring dialog"
    >
      <p>Body</p>
    </ModalShell>,
  );
  expect(opener).toHaveFocus();
});
