import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';

import Bar from '../../../../src/ui/components/Bar/Bar';

it('renders leading, main and trailing slots in one labelled bar', () => {
    render(
        <Bar
            ariaLabel="Test bar"
            leading={<span>Leading</span>}
            main={<span>Main</span>}
            overflow="scroll"
            role="toolbar"
            trailing={<span>Trailing</span>}
        />,
    );

    const bar = screen.getByRole('toolbar', { name: 'Test bar' });
    expect(bar).toHaveTextContent('LeadingMainTrailing');
    expect(bar).toHaveAttribute('data-bar-role', 'toolbar');
    expect(bar.querySelector('[data-bar-slot="leading"]')).not.toBeNull();
    expect(bar.querySelector('[data-bar-slot="main"]')).not.toBeNull();
    expect(bar.querySelector('[data-bar-slot="trailing"]')).not.toBeNull();
});

it('relocates measured main content into an overflow Popup', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 640,
    });

    try {
        render(
            <Bar
                ariaLabel="Formatting toolbar"
                leading={<span>Leading</span>}
                main={<span data-testid="relocated-item">Relocated</span>}
                overflow="menu"
                overflowBreakpoint={768}
                role="toolbar"
                trailing={<span>Trailing</span>}
            />,
        );

        const trigger = screen.getByRole('button', { name: 'More actions' });
        expect(trigger).toBeVisible();
        fireEvent.click(trigger);

        const popup = screen.getByRole('menu', { name: 'Formatting toolbar' });
        expect(popup).toBeVisible();
        expect(within(popup).getByText('Relocated')).toBeInTheDocument();
    } finally {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: originalWidth,
        });
    }
});

function StatefulItem({ name }: { readonly name: string }): React.JSX.Element {
    const [count, setCount] = useState(0);
    return (
        <button type="button" onClick={(): void => setCount(count + 1)}>
            {name}: {count}
        </button>
    );
}

it('keeps keyed item state with its item when menu bar children reorder', () => {
    const items = (reverse: boolean): React.ReactNode =>
        (reverse ? ['Beta', 'Alpha'] : ['Alpha', 'Beta']).map((name) => <StatefulItem key={name} name={name} />);
    const { rerender } = render(<Bar ariaLabel="Actions" main={items(false)} overflow="menu" role="toolbar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha: 0' }));
    rerender(<Bar ariaLabel="Actions" main={items(true)} overflow="menu" role="toolbar" />);
    expect(screen.getByRole('button', { name: 'Alpha: 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta: 0' })).toBeInTheDocument();
});
