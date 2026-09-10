import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as actionDispatcher from '../../../logic/actions/actionDispatcher';
import ViewMenu from './ViewMenu';

it('T045 keeps the shared Popup surface in the frame positioning flow', (): void => {
  const surfaceStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/components/Popup/Popup.module.css'),
    'utf8',
  );

  // The surface is owned once, by Popup, for every menu popup.
  expect(surfaceStyles).toMatch(/\.surface\s*\{[^}]*position:\s*absolute;/s);
  expect(surfaceStyles).toContain(
    'box-shadow: var(--win-shadow), var(--focus-ring)',
  );
});

it('renders synchronized pane toggles without an unlisted view-cycle shortcut', (): void => {
  const onEditorVisibilityChange = jest.fn();
  const onPreviewVisibilityChange = jest.fn();
  render(
    <ViewMenu
      editorVisible
      previewVisible={false}
      onEditorVisibilityChange={onEditorVisibilityChange}
      onPreviewVisibilityChange={onPreviewVisibilityChange}
    />,
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });

  const menu = screen.getByRole('menu', { name: 'View options' });
  expect(document.body.contains(menu)).toBe(true);
  expect(menu).toHaveAttribute('data-viewport-popup', 'view-menu');

  expect(
    screen.getByRole('menuitemcheckbox', { name: 'Show Editor' }),
  ).toHaveAttribute('data-state', 'checked');
  expect(
    screen.getByRole('menuitemcheckbox', { name: 'Show Preview' }),
  ).toHaveAttribute('data-state', 'unchecked');
  expect(
    screen.getByRole('menuitemcheckbox', { name: 'Show Editor' }),
  ).toHaveAttribute('data-disabled');

  expect(
    screen.queryByRole('menuitem', { name: /Cycle view arrangement/i }),
  ).not.toBeInTheDocument();
});

it('T061 routes legacy editor and preview view toggles through the dispatcher', async () => {
  const dispatch = jest.spyOn(actionDispatcher, 'dispatchAction');
  const onEditorVisibilityChange = jest.fn();
  const onPreviewVisibilityChange = jest.fn();
  render(
    <ViewMenu
      editorVisible
      previewVisible
      onEditorVisibilityChange={onEditorVisibilityChange}
      onPreviewVisibilityChange={onPreviewVisibilityChange}
    />,
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(
    screen.getByRole('menuitemcheckbox', { name: 'Show Editor' }),
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(
    screen.getByRole('menuitemcheckbox', { name: 'Show Preview' }),
  );

  await expect(dispatch).toHaveBeenCalledWith(
    'editor',
    expect.objectContaining({
      invoke: expect.any(Function),
      modalOpen: false,
      windowFocused: true,
    }),
  );
  expect(dispatch).toHaveBeenCalledWith(
    'preview',
    expect.objectContaining({
      modalOpen: false,
      windowFocused: true,
    }),
  );
  expect(onEditorVisibilityChange).toHaveBeenCalledWith(false);
  expect(onPreviewVisibilityChange).toHaveBeenCalledWith(false);
  dispatch.mockRestore();
});

// The whole View menu used to disappear when no document was open, which left
// the user nothing to read and no way to see what View contains. It is now
// always offered, with only the document-backed rows unavailable.
it('offers the View menu with no document open and marks the arrangement rows unavailable', (): void => {
  render(
    <ViewMenu
      arrangement="split"
      documentOpen={false}
      editorVisible
      lineNumbers
      previewVisible
      wordWrap
      onArrangementChange={jest.fn()}
      onEditorVisibilityChange={jest.fn()}
      onLineNumbersChange={jest.fn()}
      onPreviewVisibilityChange={jest.fn()}
      onWordWrapChange={jest.fn()}
    />,
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });

  const menu = screen.getByRole('menu', { name: 'View options' });
  expect(document.body.contains(menu)).toBe(true);

  for (const label of ['Editor', 'Split', 'Preview']) {
    const row = screen.getByRole('menuitemradio', { name: label });
    expect(row).toHaveAttribute('data-availability', 'unavailable');
    expect(row).toHaveAttribute('data-disabled');
  }

  // The rows that do not read the active document keep working.
  expect(
    screen.getByRole('menuitemcheckbox', { name: /Line numbers/u }),
  ).not.toHaveAttribute('data-disabled');
});

it('leaves the arrangement rows available once a document is open', (): void => {
  render(
    <ViewMenu
      arrangement="split"
      editorVisible
      previewVisible
      onArrangementChange={jest.fn()}
      onEditorVisibilityChange={jest.fn()}
      onPreviewVisibilityChange={jest.fn()}
    />,
  );

  fireEvent.keyDown(screen.getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });

  for (const label of ['Editor', 'Split', 'Preview']) {
    const row = screen.getByRole('menuitemradio', { name: label });
    expect(row).toHaveAttribute('data-availability', 'enabled');
    expect(row).not.toHaveAttribute('data-disabled');
  }
});
