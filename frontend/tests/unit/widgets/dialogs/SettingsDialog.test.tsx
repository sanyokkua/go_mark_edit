import { fireEvent, render, screen, within } from '@testing-library/react';

import SettingsDialog from '../../../../src/ui/widgets/dialogs/SettingsDialog';

function renderDialog(onOpenChange = jest.fn<void, [boolean]>()) {
    render(
        <SettingsDialog
            mode="auto"
            onModeChange={jest.fn()}
            onOpenChange={onOpenChange}
            onReset={jest.fn()}
            onThemeChange={jest.fn()}
            open
            theme="material"
        />,
    );
    return onOpenChange;
}

it('opens on Appearance with the delivered rows, a Close button and a focus trap', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dialog).getByRole('tab', { name: 'Appearance' })).toHaveFocus();
    expect(within(dialog).getByRole('tabpanel', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Color mode' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Default open mode' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Reading width' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset appearance' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'PDF appearance' })).toBeNull();
    expect(screen.queryByText(/assistant|future/i)).toBeNull();

    const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), button[tabindex="0"]'),
    );
    focusable.at(-1)?.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(focusable[0]).toHaveFocus();

    focusable[0].focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(focusable.at(-1)).toHaveFocus();
});

it('closes from the header Close button', () => {
    const onOpenChange = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('lists exactly Appearance, Editor, Markdown and Export in order', () => {
    renderDialog();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Appearance',
        'Editor',
        'Markdown',
        'Export',
    ]);
});

it('starts on Appearance each time it is opened', () => {
    const props = {
        mode: 'auto',
        onModeChange: jest.fn(),
        onOpenChange: jest.fn(),
        onReset: jest.fn(),
        onThemeChange: jest.fn(),
        theme: 'material',
    } as const;
    const { rerender } = render(<SettingsDialog {...props} open />);
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    rerender(<SettingsDialog {...props} open={false} />);
    rerender(<SettingsDialog {...props} open />);
    expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
});

it('moves between sections with the arrow, Home and End keys and shows the section at once', () => {
    renderDialog();
    const appearance = screen.getByRole('tab', { name: 'Appearance' });

    fireEvent.keyDown(appearance, { key: 'ArrowDown' });
    const editor = screen.getByRole('tab', { name: 'Editor' });
    expect(editor).toHaveFocus();
    expect(editor).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Editor' })).toBeInTheDocument();

    fireEvent.keyDown(editor, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Markdown' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Markdown' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Export' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Export' }), { key: 'ArrowUp' });
    expect(screen.getByRole('tab', { name: 'Markdown' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Markdown' }), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Editor' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveFocus();
});

it('keeps the section list as one tab stop', () => {
    renderDialog();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
});

it('shows the Editor switches and Font size drop-down with the stored values and writes changes', () => {
    const onEditorSettingsChange = jest.fn();
    const onFileSettingsChange = jest.fn();
    render(
        <SettingsDialog
            editorSettings={{ fontSize: 16, lineNumbers: true, scrollSync: false, wordWrap: false }}
            fileSettings={{ autosave: true }}
            mode="auto"
            onEditorSettingsChange={onEditorSettingsChange}
            onFileSettingsChange={onFileSettingsChange}
            onModeChange={jest.fn()}
            onOpenChange={jest.fn()}
            onReset={jest.fn()}
            onThemeChange={jest.fn()}
            open
            theme="material"
        />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Editor' }));

    expect(screen.getByRole('switch', { name: 'Autosave' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Line numbers' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Word wrap' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Scroll sync' })).toHaveAttribute('aria-checked', 'false');
    const fontSize = screen.getByRole('combobox', { name: 'Font size' });
    expect(fontSize).toHaveValue('16');
    expect(
        within(fontSize)
            .getAllByRole('option')
            .map((option) => option.textContent),
    ).toEqual(['13 px', '14 px', '16 px']);

    fireEvent.click(screen.getByRole('switch', { name: 'Word wrap' }));
    expect(onEditorSettingsChange).toHaveBeenLastCalledWith({ wordWrap: true });
    fireEvent.click(screen.getByRole('switch', { name: 'Autosave' }));
    expect(onFileSettingsChange).toHaveBeenLastCalledWith({ autosave: false });
    fireEvent.change(fontSize, { target: { value: '13' } });
    expect(onEditorSettingsChange).toHaveBeenLastCalledWith({ fontSize: 13 });
});

it('disables the Markdown controls with the loading explanation until settings are supplied', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: 'Markdown' }));

    const panel = screen.getByRole('tabpanel', { name: 'Markdown' });
    expect(within(panel).getByText('Markdown settings are loading.')).toBeInTheDocument();
    for (const radio of within(panel).getAllByRole('radio')) expect(radio).toBeDisabled();
    for (const toggle of within(panel).getAllByRole('switch')) expect(toggle).toBeDisabled();
});

it('closes on Escape and restores focus to the opener', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open settings';
    document.body.append(opener);
    opener.focus();
    const onOpenChange = jest.fn<void, [boolean]>();
    const { rerender } = render(
        <SettingsDialog
            mode="auto"
            onModeChange={jest.fn()}
            onOpenChange={onOpenChange}
            onReset={jest.fn()}
            onThemeChange={jest.fn()}
            open
            theme="material"
        />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(
        <SettingsDialog
            mode="auto"
            onModeChange={jest.fn()}
            onOpenChange={onOpenChange}
            onReset={jest.fn()}
            onThemeChange={jest.fn()}
            open={false}
            theme="material"
        />,
    );
    expect(opener).toHaveFocus();
});

/*
 * . This case survives its three siblings, and without the route.
 *
 * The rule it protects is real and was a shipped defect: at the 375px minimum
 * window a transformed shell ancestor turns a `position: fixed` dialog into an
 * absolute one and clips it, so the dialog must portal outside the application
 * frame. What made the case *look* parity-specific was that it reached the
 * surface through `?parity-case`; had already made both returns portal,
 * so the route was never what the assertion depended on.
 *
 * Its three siblings went with the substituted surface they described. Two
 * asserted `.parityOverlay` and `.parityPick` rules by reading the stylesheet as
 * text — a rule no selector in the shipped application can reach. The third
 * asserted that `Material` and `Light` rendered as selected while the props said
 * `theme="glass"` and `mode="dark"`: it pinned the substituted pane's habit of
 * reporting a state the application was not in.
 */
// application frame at the 375px minimum window, so a transformed ancestor
// cannot clip it.)
it('portals the narrow settings dialog outside the application frame', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 375,
    });
    try {
        const { container } = render(
            <SettingsDialog
                mode="auto"
                onModeChange={jest.fn()}
                onOpenChange={jest.fn()}
                onReset={jest.fn()}
                onThemeChange={jest.fn()}
                open
                theme="material"
            />,
        );
        const surface = screen.getByRole('dialog', { name: 'Settings' });
        /*
         * Portalled means "outside the tree this component was rendered into" —
         * that tree is where the shell's transformed ancestor lives. Asserting a
         * fixed number of parent levels would pin the overlay's markup instead of
         * the rule, and did: the substituted surface nested one level deeper, so the
         * old assertion counted *its* wrapper rather than checking the destination.
         */
        expect(container.contains(surface)).toBe(false);
        expect(document.body.contains(surface)).toBe(true);
    } finally {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: originalWidth,
        });
    }
});

it('shows the stored Reading width and sends page or full when a choice is selected', () => {
    const onReadingWidthChange = jest.fn();
    render(
        <SettingsDialog
            mode="auto"
            onModeChange={jest.fn()}
            onOpenChange={jest.fn()}
            onReadingWidthChange={onReadingWidthChange}
            onReset={jest.fn()}
            onThemeChange={jest.fn()}
            open
            readingWidth="full"
            theme="material"
        />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Reading width' });
    expect(within(group).getByRole('radio', { name: 'Full width' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Page' }));
    expect(onReadingWidthChange).toHaveBeenCalledWith('page');
});

it('shows the stored PDF appearance with its description and sends styled or clean when a choice is selected', () => {
    const onPdfAppearanceChange = jest.fn();
    render(
        <SettingsDialog
            mode="auto"
            onModeChange={jest.fn()}
            onOpenChange={jest.fn()}
            onPdfAppearanceChange={onPdfAppearanceChange}
            onReset={jest.fn()}
            onThemeChange={jest.fn()}
            open
            pdfAppearance="clean"
            theme="material"
        />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    const group = screen.getByRole('radiogroup', { name: 'PDF appearance' });
    expect(group).toHaveAccessibleDescription(/black text on white/u);
    expect(within(group).getByRole('radio', { name: 'Clean' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Styled' }));
    expect(onPdfAppearanceChange).toHaveBeenCalledWith('styled');
});

it('disables the PDF appearance group when no change handler is supplied', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    const group = screen.getByRole('radiogroup', { name: 'PDF appearance' });
    for (const radio of within(group).getAllByRole('radio')) {
        expect(radio).toBeDisabled();
    }
});
