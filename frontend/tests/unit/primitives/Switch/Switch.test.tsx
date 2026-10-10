import { fireEvent, render, screen } from '@testing-library/react';

import Switch from '../../../../src/ui/primitives/Switch';

it('exposes a switch with its state and name and reports the next value on click', () => {
    const onChange = jest.fn();
    render(<Switch checked={false} label="Word wrap" onChange={onChange} />);

    const control = screen.getByRole('switch', { name: 'Word wrap' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
});

it('announces the on state and reports off when turned off', () => {
    const onChange = jest.fn();
    render(<Switch checked label="Word wrap" onChange={onChange} />);

    const control = screen.getByRole('switch', { name: 'Word wrap' });
    expect(control).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(false);
});

it.each([' ', 'Enter'])('toggles with the %j key', (key) => {
    const onChange = jest.fn();
    render(<Switch checked={false} label="Word wrap" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('switch', { name: 'Word wrap' }), { key });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
});

it('does nothing and cannot be focused by Tab when disabled', () => {
    const onChange = jest.fn();
    render(<Switch checked={false} disabled label="Word wrap" onChange={onChange} />);

    const control = screen.getByRole('switch', { name: 'Word wrap' });
    expect(control).toBeDisabled();
    fireEvent.click(control);
    fireEvent.keyDown(control, { key: ' ' });
    expect(onChange).not.toHaveBeenCalled();
});

it('is described by the supplied description', () => {
    render(
        <>
            <span id="why">Wrap long lines</span>
            <Switch checked={false} describedBy="why" label="Word wrap" onChange={jest.fn()} />
        </>,
    );
    expect(screen.getByRole('switch', { name: 'Word wrap' })).toHaveAccessibleDescription('Wrap long lines');
});
