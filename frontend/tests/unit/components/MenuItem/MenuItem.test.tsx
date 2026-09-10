import { fireEvent, render, screen } from '@testing-library/react';

import MenuItem from '../../../../src/ui/components/MenuItem/MenuItem';

it('renders the one menu-item contract with icon, accelerator, and selection state', () => {
  const onSelect = jest.fn();
  render(
    <div role="menu">
      <MenuItem
        accelerator="⌘S"
        checked
        icon={<span aria-hidden="true">I</span>}
        label="Save"
        radio
        submenu={<span>More save choices</span>}
        onSelect={onSelect}
      />
    </div>,
  );

  const item = screen.getByRole('menuitemradio', { name: /Save/ });
  expect(item).toHaveAttribute('aria-checked', 'true');
  expect(item).toHaveAttribute('data-shortcut', '⌘S');
  expect(item).toHaveTextContent('I');
  expect(item).toHaveTextContent('More save choices');
  fireEvent.click(item);
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it('keeps a deferred menu item visible but unavailable', () => {
  render(
    <div role="menu">
      <MenuItem disabled label="Export" onSelect={jest.fn()} />
    </div>,
  );

  const item = screen.getByRole('menuitem', { name: 'Export' });
  expect(item).toBeDisabled();
  expect(item).toHaveAttribute('aria-disabled', 'true');
});
