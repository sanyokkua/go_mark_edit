import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as actionDispatcher from '../../logic/actions/actionDispatcher';
import ViewMenu from './ViewMenu';

it('T045 keeps the Radix view popup in the Popper positioning flow', (): void => {
  const viewStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/primitives/ViewMenu.module.css'),
    'utf8',
  );

  expect(viewStyles).toMatch(
    /\.content\s*\{[^}]*position:\s*relative;/s,
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
