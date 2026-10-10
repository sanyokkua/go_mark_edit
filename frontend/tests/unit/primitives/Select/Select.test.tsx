import { fireEvent, render, screen, within } from '@testing-library/react';

import Select from '../../../../src/ui/primitives/Select';

const options = [
    { label: '13 px', value: '13' },
    { label: '14 px', value: '14' },
    { label: '16 px', value: '16' },
] as const;

it('shows its label, the options and the selected value', () => {
    render(<Select label="Font size" options={options} value="14" onChange={jest.fn()} />);

    const control = screen.getByRole('combobox', { name: 'Font size' });
    expect(control).toHaveValue('14');
    expect(
        within(control)
            .getAllByRole('option')
            .map((option) => option.textContent),
    ).toEqual(['13 px', '14 px', '16 px']);
});

it('reports the chosen value', () => {
    const onChange = jest.fn();
    render(<Select label="Font size" options={options} value="14" onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Font size' }), { target: { value: '16' } });
    expect(onChange).toHaveBeenCalledWith('16');
});

it('can be disabled', () => {
    render(<Select disabled label="Font size" options={options} value="14" onChange={jest.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Font size' })).toBeDisabled();
});
