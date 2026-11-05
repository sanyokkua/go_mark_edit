import { fireEvent, render, screen } from '@testing-library/react';

import Sidebar from '../../../../src/ui/components/Sidebar/Sidebar';

function pointerEvent(type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number, pointerId: number): Event {
    const event = new Event(type, { bubbles: true });
    Object.defineProperties(event, {
        clientX: { value: clientX },
        pointerId: { value: pointerId },
    });
    return event;
}

it('connects each divider to its own pane and keeps that relationship through collapse and resize', () => {
    const props = {
        minWidth: 0,
        onResize: jest.fn(),
        onResizeEnd: jest.fn(),
    };
    const sidebars = (collapsed: boolean, width: number): React.JSX.Element => (
        <>
            <Sidebar {...props} ariaLabel="Workspace" collapsed={collapsed} side="left" width={width} />
            <Sidebar {...props} ariaLabel="Secondary" collapsed={false} side="right" width={216} />
        </>
    );
    const { rerender } = render(sidebars(false, 216));
    const pane = screen.getByRole('complementary', { name: 'Workspace' });
    const secondary = screen.getByRole('complementary', { name: 'Secondary' });
    expect(pane.id).not.toBe('');
    expect(secondary.id).not.toBe(pane.id);
    expect(screen.getByRole('separator', { name: 'Resize Workspace' })).toHaveAttribute('aria-controls', pane.id);
    expect(screen.getByRole('separator', { name: 'Resize Secondary' })).toHaveAttribute('aria-controls', secondary.id);
    const id = pane.id;

    rerender(sidebars(true, 264));
    expect(screen.queryByRole('separator', { name: 'Resize Workspace' })).not.toBeInTheDocument();
    expect(pane).toHaveAttribute('id', id);
    rerender(sidebars(false, 264));
    expect(screen.getByRole('separator', { name: 'Resize Workspace' })).toHaveAttribute('aria-controls', id);
    expect(document.getElementById(id)).toBe(pane);
});

it('reports pointer resize updates and the final width through separate callbacks', () => {
    const onResize = jest.fn();
    const onResizeEnd = jest.fn();

    render(
        <Sidebar
            ariaLabel="Workspace"
            collapsed={false}
            minWidth={0}
            onResize={onResize}
            onResizeEnd={onResizeEnd}
            side="left"
            width={216}
        >
            <p>Workspace content</p>
        </Sidebar>,
    );

    const divider = screen.getByRole('separator', { name: 'Resize Workspace' });
    fireEvent(divider, pointerEvent('pointerdown', 216, 7));
    fireEvent(window, pointerEvent('pointermove', 264, 7));
    fireEvent(window, pointerEvent('pointerup', 264, 7));

    expect(onResize).toHaveBeenCalledWith(264);
    expect(onResizeEnd).toHaveBeenCalledWith(264);
});

it('uses the minimum width and arrow direction when resizing from the keyboard', () => {
    const onResize = jest.fn();

    render(
        <Sidebar
            ariaLabel="Workspace"
            collapsed={false}
            minWidth={200}
            onResize={onResize}
            onResizeEnd={jest.fn()}
            side="left"
            width={208}
        />,
    );

    const divider = screen.getByRole('separator', { name: 'Resize Workspace' });
    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });

    expect(onResize).toHaveBeenNthCalledWith(1, 200);
    expect(onResize).toHaveBeenNthCalledWith(2, 216);
});

it('does not expose a resize handle for a collapsed sidebar', () => {
    render(
        <Sidebar
            ariaLabel="Workspace"
            collapsed
            minWidth={0}
            onResize={jest.fn()}
            onResizeEnd={jest.fn()}
            side="left"
            width={216}
        >
            <p>Workspace content</p>
        </Sidebar>,
    );

    expect(screen.queryByRole('separator', { name: 'Resize Workspace' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Workspace', { selector: 'aside' })).toHaveAttribute('aria-hidden', 'true');
});
