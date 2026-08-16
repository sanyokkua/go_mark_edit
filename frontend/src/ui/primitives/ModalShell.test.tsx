import { createRef } from 'react';
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

it('ModalShell honors a requested initial control before trapping focus', () => {
  const initialFocusRef = createRef<HTMLButtonElement>();
  render(
    <ModalShell
      initialFocusRef={initialFocusRef}
      labelledBy="modal-title"
      onBackdrop={jest.fn()}
      onEscape={jest.fn()}
      open
      title="Accessible modal"
    >
      <button ref={initialFocusRef} type="button">
        Cancel
      </button>
      <button type="button">Confirm</button>
    </ModalShell>,
  );

  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
});

/*
 * T138. FR-FT-054 permits a populated fixture to be seeded only on the
 * deterministic parity route. It does not permit a different component
 * structure, and this shell had three:
 *
 *   - production: an `aria-hidden` backdrop and a sibling
 *     `role="dialog" aria-modal aria-label` section, rendered inline;
 *   - `?parity-case` at any width: the backdrop became the dialog and the
 *     section had `role`, `aria-modal` and `aria-label` forced to `undefined`
 *     — the accessibility contract removed from the DOM the harness measures;
 *   - `?parity-case` at 376px or less: the same, portalled to `document.body`.
 *
 * So the harness measured a structure that does not ship, which is the
 * mock-divergence class that hid T104 and T107 relocated into production code.
 * One structure now, portalled unconditionally, so the route can change what
 * data is seeded and nothing else.
 */
// Proves: FR-FT-054 (partial — only "any populated multi-document fixture used
//   for parity MUST be seeded only on the deterministic parity route", read as
//   the route may seed data and may not change the rendered structure. The
//   capture-condition, readiness and frozen-caret clauses are proven by the
//   parity harness.)
it('T138 renders one modal structure and one accessibility contract on every route', () => {
  const describeModal = (): Record<string, string | boolean | null> => {
    const shell = document.querySelector('[data-modal-shell]');
    const backdrop = document.querySelector('[data-modal-backdrop]');
    if (shell === null || backdrop === null) {
      throw new Error('modal did not render a shell and a backdrop');
    }
    return {
      shellRole: shell.getAttribute('role'),
      shellAriaModal: shell.getAttribute('aria-modal'),
      shellAriaLabel: shell.getAttribute('aria-label'),
      shellParentIsBody: shell.parentElement === document.body,
      backdropRole: backdrop.getAttribute('role'),
      backdropAriaHidden: backdrop.getAttribute('aria-hidden'),
      backdropWrapsShell: backdrop.contains(shell),
    };
  };

  const originalUrl = window.location.href;
  const originalWidth = window.innerWidth;
  const shapeAt = (
    url: string,
    width: number,
  ): Record<string, string | boolean | null> => {
    window.history.replaceState({}, '', url);
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: width,
    });
    const rendered = render(
      <ModalShell
        labelledBy="modal-title"
        onBackdrop={jest.fn()}
        onEscape={jest.fn()}
        open
        title="Accessible modal"
      >
        <button type="button">First</button>
      </ModalShell>,
    );
    const shape = describeModal();
    rendered.unmount();
    return shape;
  };

  try {
    const production = shapeAt('/', 1280);
    expect(production).toEqual({
      shellRole: 'dialog',
      shellAriaModal: 'true',
      shellAriaLabel: 'Accessible modal',
      shellParentIsBody: true,
      backdropRole: null,
      backdropAriaHidden: 'true',
      backdropWrapsShell: false,
    });

    // The two shapes the parity route used to substitute for it.
    expect(
      shapeAt('/?parity-case=primary:save-prompt:1280:glass-light', 1280),
    ).toEqual(production);
    expect(
      shapeAt('/?parity-case=primary:save-prompt:375:glass-light', 375),
    ).toEqual(production);
  } finally {
    window.history.replaceState({}, '', originalUrl);
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  }
});
