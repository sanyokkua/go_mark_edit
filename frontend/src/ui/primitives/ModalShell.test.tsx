import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

it('T045 maps the parity dialog to its bounded scrim while retaining the inner focus surface', () => {
  const originalUrl = window.location.href;
  window.history.replaceState(
    {},
    '',
    '/?parity-case=primary:save-prompt:1280:glass-light',
  );
  try {
    render(
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

    const dialog = screen.getByRole('dialog', { name: 'Accessible modal' });
    expect(dialog).toHaveAttribute('data-modal-backdrop');
    expect(dialog.querySelector('[data-modal-shell]')).toBeInTheDocument();
    expect(dialog.querySelector('[data-modal-shell]')).not.toHaveAttribute(
      'role',
      'dialog',
    );
  } finally {
    window.history.replaceState({}, '', originalUrl);
  }
});

it('T045 keeps narrow parity modal scrims viewport-owned', () => {
  const styles = readFileSync(
    resolve(process.cwd(), 'src/ui/primitives/ModalShell.module.css'),
    'utf8',
  );

  expect(styles).toMatch(
    /@media \(max-width: 376px\) \{\s*\.parityOverlay\s*\{[^}]*position:\s*fixed;/s,
  );
  expect(styles).toMatch(
    /\.parityOverlay\s*\{[^}]*backdrop-filter:\s*blur\(3px\);/s,
  );
  expect(styles).toMatch(
    /@media \(min-width: 377px\)[\s\S]*?\.parityReloadOverlay\s*\{[^}]*inset-block-start:\s*-44px;[^}]*height:\s*calc\(100% \+ 44px\);/s,
  );
  expect(styles).toMatch(
    /\.parityReloadContent\s*\{[^}]*width:\s*min\(560px, 92%\);/s,
  );
});

it('T045 portals narrow parity modal scrims outside blurred app frames', () => {
  const originalUrl = window.location.href;
  const originalWidth = window.innerWidth;
  window.history.replaceState(
    {},
    '',
    '/?parity-case=primary:save-prompt:375:glass-light',
  );
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  try {
    render(
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

    expect(
      screen.getByRole('dialog', { name: 'Accessible modal' }).parentElement,
    ).toBe(document.body);
  } finally {
    window.history.replaceState({}, '', originalUrl);
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
  }
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
