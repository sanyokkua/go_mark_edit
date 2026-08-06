import { fireEvent, render, screen } from '@testing-library/react';

import ShortcutsDialog from './ShortcutsDialog';

it('T030 renders the complete registry-derived shortcuts catalogue', () => {
  render(<ShortcutsDialog open onOpenChange={jest.fn()} />);

  const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveTextContent('Bold');
  expect(dialog).toHaveTextContent('Heading 1');
  expect(dialog).toHaveTextContent('Format');
  expect(dialog).toHaveTextContent(/⌘|Ctrl/);
  expect(dialog.querySelectorAll('kbd').length).toBeGreaterThan(5);
});

it('T030 closes on Escape and restores focus to the opener', () => {
  const onOpenChange = jest.fn();
  render(
    <>
      <button type="button">Open shortcuts</button>
      <ShortcutsDialog open onOpenChange={onOpenChange} />
    </>,
  );
  const opener = screen.getByRole('button', { name: 'Open shortcuts' });
  opener.focus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('T051 renders registry scope and localized deferred availability metadata', () => {
  render(<ShortcutsDialog open onOpenChange={jest.fn()} />);

  for (const [id, label] of [
    ['format', 'Format'],
    ['compact', 'Compact'],
    ['lint', 'Lint'],
  ] as const) {
    const row = screen.getByText(label).closest(`[data-action-id="${id}"]`);
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent('Document');
    expect(row).toHaveTextContent(
      'This action is not available in this slice.',
    );
    expect(row).toHaveAttribute('data-availability', 'deferred');
  }

  const commandPalette = screen
    .getByText('Command palette')
    .closest('[data-action-id="command-palette"]');
  expect(commandPalette).toBeInTheDocument();
  expect(commandPalette).toHaveTextContent('Window');
  expect(commandPalette).toHaveTextContent(
    'This action is not available in this slice.',
  );
  expect(commandPalette).toHaveAttribute('data-availability', 'deferred');
});

it('T070 closes the modal on a backdrop pointer interaction', () => {
  const onOpenChange = jest.fn();
  render(<ShortcutsDialog open onOpenChange={onOpenChange} />);

  fireEvent.pointerDown(document.querySelector('[aria-hidden="true"]')!);
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
