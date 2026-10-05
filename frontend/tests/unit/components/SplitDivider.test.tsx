import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import SplitDivider from '../../../src/ui/components/SplitDivider';

function pointer(type: string, x: number, id = 7): Event {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, {
        clientX: { value: x },
        pointerId: { value: id },
        button: { value: 0 },
    });
    return event;
}

function Harness({
    onCommit = jest.fn(),
    identity = 'one',
}: {
    onCommit?: (value: number) => void;
    identity?: string;
}): React.JSX.Element {
    const [value, setValue] = useState(0.5);
    return (
        <SplitDivider
            ariaLabel="Resize editor and preview panes"
            identity={identity}
            value={value}
            getWidth={() => 1000}
            onResize={setValue}
            onCommit={onCommit}
            valueText={(ratio) => `${Math.round(ratio * 100)}% editor`}
        />
    );
}

it('changes the editor share during dragging and commits when released outside the divider', () => {
    const commit = jest.fn();
    render(<Harness onCommit={commit} />);
    const divider = screen.getByRole('separator');
    fireEvent(divider, pointer('pointerdown', 500));
    fireEvent(window, pointer('pointermove', 650));
    expect(divider).toHaveAttribute('aria-valuenow', '65');
    expect(divider).toHaveAttribute('aria-valuetext', '65% editor');
    expect(commit).not.toHaveBeenCalled();
    fireEvent(window, pointer('pointerup', 650));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(0.65);
});

it('bounds dragging to twenty through eighty percent and ignores other pointers', () => {
    render(<Harness />);
    const divider = screen.getByRole('separator');
    fireEvent(divider, pointer('pointerdown', 500));
    fireEvent(window, pointer('pointermove', 800, 8));
    expect(divider).toHaveAttribute('aria-valuenow', '50');
    fireEvent(window, pointer('pointermove', 1500));
    expect(divider).toHaveAttribute('aria-valuenow', '80');
    fireEvent(window, pointer('pointermove', -500));
    expect(divider).toHaveAttribute('aria-valuenow', '20');
});

it('restores the starting share when a pointer drag is cancelled', () => {
    const commit = jest.fn();
    render(<Harness onCommit={commit} />);
    const divider = screen.getByRole('separator');
    fireEvent(divider, pointer('pointerdown', 500));
    fireEvent(window, pointer('pointermove', 600));
    fireEvent(window, pointer('pointercancel', 600));
    expect(divider).toHaveAttribute('aria-valuenow', '50');
    fireEvent(window, pointer('pointerup', 600));
    expect(commit).not.toHaveBeenCalled();
});

it('adjusts two percentage points with arrows and reaches the limits with Home and End', () => {
    const commit = jest.fn();
    render(<Harness onCommit={commit} />);
    const divider = screen.getByRole('separator');
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(divider).toHaveAttribute('aria-valuenow', '52');
    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    expect(divider).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(divider, { key: 'Home' });
    expect(divider).toHaveAttribute('aria-valuenow', '20');
    fireEvent.keyDown(divider, { key: 'End' });
    expect(divider).toHaveAttribute('aria-valuenow', '80');
    expect(commit.mock.calls.map(([ratio]) => ratio)).toEqual([0.52, 0.5, 0.2, 0.8]);
});

it('stops an old drag when the document changes or the divider unmounts', () => {
    const commit = jest.fn();
    const { rerender, unmount } = render(<Harness onCommit={commit} />);
    const divider = screen.getByRole('separator');
    fireEvent(divider, pointer('pointerdown', 500));
    rerender(<Harness identity="two" onCommit={commit} />);
    fireEvent(window, pointer('pointermove', 750));
    fireEvent(window, pointer('pointerup', 750));
    expect(divider).toHaveAttribute('aria-valuenow', '50');
    expect(commit).not.toHaveBeenCalled();
    fireEvent(divider, pointer('pointerdown', 500));
    unmount();
    fireEvent(window, pointer('pointerup', 750));
    expect(commit).not.toHaveBeenCalled();
});

it('ignores dragging when the layout has no measurable width', () => {
    const resize = jest.fn();
    render(
        <SplitDivider
            ariaLabel="Resize"
            identity="one"
            value={0.5}
            getWidth={() => 0}
            onResize={resize}
            onCommit={jest.fn()}
            valueText={String}
        />,
    );
    fireEvent(screen.getByRole('separator'), pointer('pointerdown', 500));
    fireEvent(window, pointer('pointermove', 750));
    expect(resize).not.toHaveBeenCalled();
});
