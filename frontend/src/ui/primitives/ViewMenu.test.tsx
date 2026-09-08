import { fireEvent, render, screen } from '@testing-library/react';

import ViewMenu from './ViewMenu';

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
