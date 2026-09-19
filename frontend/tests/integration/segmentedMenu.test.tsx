import { fireEvent, render, screen } from '@testing-library/react';

import MenuItem from '../../src/ui/components/MenuItem';
import Segmented, { type SegmentedOption, type SegmentedOptionButtonProps } from '../../src/ui/primitives/Segmented';

const options = [
    { label: 'Glass', value: 'glass' },
    { label: 'Material', value: 'material' },
    { label: 'Minimal', value: 'minimal' },
] as const;
type Theme = (typeof options)[number]['value'];

function renderOption(option: SegmentedOption<Theme>, { onClick, ...buttonProps }: SegmentedOptionButtonProps) {
    return (
        <MenuItem
            {...buttonProps}
            checked={buttonProps['aria-checked'] === true}
            label={`Choose ${option.label}`}
            role="radio"
            onSelect={onClick}
        />
    );
}

it('keeps custom radio selection and focus on the acknowledged value', () => {
    const requested: Theme[] = [];
    const props = {
        ariaLabel: 'Theme',
        onChange: (value: Theme): void => {
            requested.push(value);
        },
        options,
        renderOption,
        value: 'glass' as Theme,
    };
    const { rerender } = render(<Segmented {...props} />);
    const glass = screen.getByRole('radio', { name: 'Choose Glass' });
    const material = screen.getByRole('radio', { name: 'Choose Material' });
    glass.focus();
    fireEvent.keyDown(glass, { key: 'ArrowDown' });

    expect(requested).toEqual(['material']);
    expect(glass).toBeChecked();
    expect(glass).toHaveFocus();
    expect(material).not.toBeChecked();

    rerender(<Segmented {...props} value="material" />);
    expect(material).toBeChecked();
    expect(material).toHaveFocus();
    expect(material).toHaveAttribute('tabindex', '0');
    expect(glass).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(material, { key: 'End' });
    expect(requested).toEqual(['material', 'minimal']);
    rerender(<Segmented {...props} value="minimal" />);
    const minimal = screen.getByRole('radio', { name: 'Choose Minimal' });
    expect(minimal).toHaveFocus();
    fireEvent.keyDown(minimal, { key: 'Home' });
    rerender(<Segmented {...props} value="glass" />);
    expect(glass).toHaveFocus();
});

it.each(['Enter', ' '])('activates a custom radio exactly once with %s', (key) => {
    const onChange = jest.fn();
    const props = { ariaLabel: 'Theme', onChange, options, renderOption, value: 'glass' as Theme };
    render(<Segmented {...props} />);
    const material = screen.getByRole('radio', { name: 'Choose Material' });
    fireEvent.keyDown(material, { key });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('material');
    fireEvent.click(material);
    expect(onChange).toHaveBeenCalledTimes(2);
});

it('shows the shared check only for a selected row without a custom trailing control', () => {
    render(
        <>
            <MenuItem checked label="Light" radio />
            <MenuItem checked={false} label="Dark" radio />
            <MenuItem checked label="Autosave" trailing={<span aria-hidden="true">Switch</span>} />
        </>,
    );
    expect(
        screen.getByRole('menuitemradio', { name: 'Light' }).querySelector('[data-icon-name="check"]'),
    ).not.toBeNull();
    expect(screen.getByRole('menuitemradio', { name: 'Dark' }).querySelector('[data-icon-name="check"]')).toBeNull();
    expect(
        screen.getByRole('menuitemcheckbox', { name: 'Autosave' }).querySelector('[data-icon-name="check"]'),
    ).toBeNull();
});
