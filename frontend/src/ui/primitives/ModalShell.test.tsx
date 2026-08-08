import { fireEvent, render, screen } from '@testing-library/react';
import ModalShell from './ModalShell';

it('ModalShell focus contract', () => {
  const onEscape = jest.fn();
  const onBackdrop = jest.fn();
  const rendered = render(
    <>
      <button type="button">Open conflict</button>
      <ModalShell
        labelledBy="modal-title"
        onBackdrop={onBackdrop}
        onEscape={onEscape}
        open={false}
        title="Accessible modal"
      >
        <button type="button">First</button>
        <button type="button">Second</button>
      </ModalShell>
    </>,
  );

  const origin = screen.getByRole('button', { name: 'Open conflict' });
  origin.focus();
  rendered.rerender(
    <>
      <button type="button">Open conflict</button>
      <ModalShell
        labelledBy="modal-title"
        onBackdrop={onBackdrop}
        onEscape={onEscape}
        open
        title="Accessible modal"
      >
        <button type="button">First</button>
        <button type="button">Second</button>
      </ModalShell>
    </>,
  );

  const dialog = screen.getByRole('dialog', { name: 'Accessible modal' });
  const first = screen.getByRole('button', { name: 'First' });
  const second = screen.getByRole('button', { name: 'Second' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(second).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(second).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(onEscape).toHaveBeenCalledTimes(1);
  rendered.rerender(<button type="button">Open conflict</button>);
  expect(screen.getByRole('button', { name: 'Open conflict' })).toHaveFocus();
});

it('ModalShell sends backdrop requests only for the backdrop surface', () => {
  const onBackdrop = jest.fn();
  render(
    <ModalShell
      labelledBy="modal-title"
      onBackdrop={onBackdrop}
      onEscape={jest.fn()}
      open
      title="Accessible modal"
    >
      <button type="button">First</button>
    </ModalShell>,
  );

  fireEvent.pointerDown(
    document.querySelector('[data-modal-backdrop]') as HTMLElement,
  );
  expect(onBackdrop).toHaveBeenCalledTimes(1);
});
