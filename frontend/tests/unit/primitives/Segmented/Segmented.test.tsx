import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import Segmented from '../../../../src/ui/primitives/Segmented/Segmented';

const options = [
    { label: 'Editor', value: 'editor' },
    { label: 'Split', value: 'split' },
    { label: 'Preview', value: 'preview' },
] as const;

const SegmentedHarness: React.FC = (): React.JSX.Element => {
    const [value, setValue] = useState<(typeof options)[number]['value']>('editor');

    return <Segmented ariaLabel="View arrangement" options={options} value={value} onChange={setValue} />;
};

it('owns roving radio focus for Arrow, Home and End keys', () => {
    render(<SegmentedHarness />);

    const editor = screen.getByRole('radio', { name: 'Editor' });
    editor.focus();
    fireEvent.keyDown(editor, { key: 'End' });

    const preview = screen.getByRole('radio', { name: 'Preview' });
    expect(preview).toBeChecked();
    expect(preview).toHaveFocus();

    fireEvent.keyDown(preview, { key: 'Home' });
    expect(editor).toBeChecked();
    expect(editor).toHaveFocus();

    fireEvent.keyDown(editor, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Split' })).toBeChecked();
});

it('leaves focus on another group when an earlier selection is acknowledged', () => {
    let acknowledgeTheme: (() => void) | undefined;
    const Harness = (): React.JSX.Element => {
        const [theme, setTheme] = useState<'material' | 'glass'>('material');
        const [mode, setMode] = useState<'dark' | 'light'>('dark');
        return (
            <>
                <Segmented
                    ariaLabel="Theme"
                    options={[
                        { label: 'Material', value: 'material' },
                        { label: 'Glass', value: 'glass' },
                    ]}
                    value={theme}
                    onChange={(next): void => {
                        acknowledgeTheme = (): void => setTheme(next);
                    }}
                />
                <Segmented
                    ariaLabel="Mode"
                    options={[
                        { label: 'Dark', value: 'dark' },
                        { label: 'Light', value: 'light' },
                    ]}
                    value={mode}
                    onChange={setMode}
                />
            </>
        );
    };
    render(<Harness />);

    const glass = screen.getByRole('radio', { name: 'Glass' });
    const light = screen.getByRole('radio', { name: 'Light' });
    glass.focus();
    fireEvent.keyDown(glass, { key: ' ' });
    expect(acknowledgeTheme).toBeDefined();
    light.focus();
    act((): void => acknowledgeTheme?.());

    expect(light).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: ' ' });
    expect(light).toBeChecked();
});

it('leaves Ctrl and Cmd with Enter or Space unhandled so window shortcuts receive them', () => {
    const onChange = jest.fn();
    render(<Segmented ariaLabel="View arrangement" options={options} value="editor" onChange={onChange} />);
    const split = screen.getByRole('radio', { name: 'Split' });

    for (const modifier of ['ctrlKey', 'metaKey'] as const) {
        expect(fireEvent.keyDown(split, { key: 'Enter', [modifier]: true })).toBe(true);
        expect(fireEvent.keyDown(split, { key: ' ', [modifier]: true })).toBe(true);
    }
    expect(onChange).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(split, { key: 'Enter' })).toBe(false);
    expect(onChange).toHaveBeenCalledWith('split');
});
