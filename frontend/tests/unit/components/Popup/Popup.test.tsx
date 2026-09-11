import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

import Popup, {
  PopupGroupLabel,
  PopupSeparator,
  PopupTrigger,
} from '../../../../src/ui/components/Popup/Popup';
import MenuItem from '../../../../src/ui/components/MenuItem/MenuItem';

function PopupHarness(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  return (
    <div className="application-frame">
      <PopupTrigger
        ref={setTrigger}
        expanded={open}
        onClick={(): void => setOpen((value) => !value)}
      >
        Open
      </PopupTrigger>
      <Popup
        anchor={{ trigger }}
        open={open}
        role="menu"
        size="menu"
        onOpenChange={setOpen}
      >
        <PopupGroupLabel>Actions</PopupGroupLabel>
        <MenuItem label="Alpha" onSelect={jest.fn()} />
        <MenuItem label="Beta" onSelect={jest.fn()} />
        <PopupSeparator />
        <MenuItem disabled label="Unavailable" onSelect={jest.fn()} />
      </Popup>
    </div>
  );
}

it('renders one framed popup, focuses its first item, navigates, and restores the trigger', async () => {
  render(<PopupHarness />);

  const trigger = screen.getByRole('button', { name: 'Open' });
  fireEvent.click(trigger);

  const popup = await screen.findByRole('menu');
  expect(popup.parentElement).toHaveClass('application-frame');
  expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus();

  fireEvent.keyDown(popup, { key: 'ArrowDown' });
  expect(screen.getByRole('menuitem', { name: 'Beta' })).toHaveFocus();
  fireEvent.keyDown(popup, { key: 'End' });
  expect(screen.getByRole('menuitem', { name: 'Beta' })).toHaveFocus();
  fireEvent.keyDown(popup, { key: 'Home' });
  expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus();
  fireEvent.keyDown(popup, { key: 'b' });
  expect(screen.getByRole('menuitem', { name: 'Beta' })).toHaveFocus();

  fireEvent.keyDown(popup, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(trigger).toHaveFocus();
});

it('attaches outside-pointer dismissal only while open and preserves the portal boundary', async () => {
  const onOpenChange = jest.fn();
  const result = render(
    <div className="application-frame">
      <button type="button">Outside</button>
      <Popup
        anchor={{ point: { x: 40, y: 40 } }}
        open
        role="menu"
        size="wide"
        onOpenChange={onOpenChange}
      >
        <MenuItem label="Only item" />
      </Popup>
    </div>,
  );

  const popup = await screen.findByRole('menu');
  expect(popup).toHaveAttribute('data-popup-size', 'wide');
  await waitFor(() =>
    expect(screen.getByRole('menuitem', { name: 'Only item' })).toHaveFocus(),
  );
  fireEvent.pointerDown(result.getByRole('button', { name: 'Outside' }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('focuses the first visible MenuItem when a responsive group is hidden', async () => {
  render(
    <Popup
      anchor={{ point: { x: 40, y: 40 } }}
      open
      role="menu"
      size="menu"
      onOpenChange={jest.fn()}
    >
      <div style={{ display: 'none' }}>
        <MenuItem label="Hidden" />
      </div>
      <MenuItem label="Visible" />
    </Popup>,
  );

  await waitFor(() =>
    expect(screen.getByRole('menuitem', { name: 'Visible' })).toHaveFocus(),
  );
  expect(document.activeElement).not.toBe(screen.getByText('Hidden'));
});
