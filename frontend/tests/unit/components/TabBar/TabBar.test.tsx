import { fireEvent, render, screen } from '@testing-library/react';

import TabBar, { type TabBarTab } from '../../../../src/ui/components/TabBar/TabBar';

const tabs: readonly TabBarTab[] = [
    {
        active: true,
        dirty: true,
        id: 'one',
        label: 'One',
        readOnly: false,
    },
    {
        active: false,
        dirty: false,
        id: 'two',
        label: 'Two',
        readOnly: true,
    },
    {
        active: false,
        dirty: false,
        id: 'three',
        label: 'Three',
        readOnly: false,
    },
];

function renderTabBar(overrides: Partial<React.ComponentProps<typeof TabBar>> = {}): {
    onActivate: jest.Mock;
    onClose: jest.Mock;
    onAdd: jest.Mock;
    onReorder: jest.Mock;
    onContextMenu: jest.Mock;
} {
    const callbacks = {
        onActivate: jest.fn(),
        onClose: jest.fn(),
        onAdd: jest.fn(),
        onReorder: jest.fn(),
        onContextMenu: jest.fn(),
    };
    render(<TabBar ariaLabel="Document tabs" tabs={tabs} {...callbacks} {...overrides} />);
    return callbacks;
}

it('routes tab activation, close, add and context actions by tab id', () => {
    const callbacks = renderTabBar();

    fireEvent.click(screen.getByRole('tab', { name: 'One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Two' }));
    fireEvent.click(screen.getByRole('button', { name: 'New tab' }));

    const firstTab = screen.getByRole('tab', { name: 'One' });
    fireEvent.contextMenu(firstTab, { clientX: 40, clientY: 24 });

    expect(callbacks.onActivate).toHaveBeenCalledWith('one');
    expect(callbacks.onClose).toHaveBeenCalledWith('two');
    expect(callbacks.onAdd).toHaveBeenCalledTimes(1);
    expect(callbacks.onContextMenu).toHaveBeenCalledWith('one', {
        point: { x: 40, y: 24 },
    });
});

it('uses the focused tab bounds for a keyboard context-menu request', () => {
    const callbacks = renderTabBar();
    const tab = screen.getByRole('tab', { name: 'Two' });
    Object.defineProperty(tab, 'getBoundingClientRect', {
        configurable: true,
        value: (): DOMRect => new DOMRect(10, 20, 90, 30),
    });

    tab.focus();
    fireEvent.keyDown(tab, { key: 'ContextMenu' });

    expect(callbacks.onContextMenu).toHaveBeenCalledWith('two', {
        bounds: expect.objectContaining({
            bottom: 50,
            height: 30,
            left: 10,
            right: 100,
            top: 20,
            width: 90,
        }),
    });
});

it('reports a dragged tab destination without projecting order locally', () => {
    const callbacks = renderTabBar();
    const firstTab = screen.getByRole('tab', { name: 'One' });
    const secondTab = screen.getByRole('tab', { name: 'Two' });
    const thirdTab = screen.getByRole('tab', { name: 'Three' });
    Object.defineProperty(firstTab.parentElement, 'getBoundingClientRect', {
        configurable: true,
        value: (): DOMRect => new DOMRect(0, 0, 50, 30),
    });
    Object.defineProperty(secondTab.parentElement, 'getBoundingClientRect', {
        configurable: true,
        value: (): DOMRect => new DOMRect(50, 0, 50, 30),
    });
    Object.defineProperty(thirdTab.parentElement, 'getBoundingClientRect', {
        configurable: true,
        value: (): DOMRect => new DOMRect(100, 0, 50, 30),
    });

    fireEvent(
        firstTab,
        new MouseEvent('pointerdown', {
            bubbles: true,
            button: 0,
            clientX: 10,
        }),
    );
    fireEvent(document, new MouseEvent('pointermove', { bubbles: true, clientX: 140 }));
    fireEvent(document, new MouseEvent('pointerup', { bubbles: true, clientX: 140 }));

    expect(callbacks.onReorder).toHaveBeenCalledWith('one', 2);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['One', 'Two', 'Three']);
});

it('keeps the tablist inside one labelled scrollable bar with tab state exposed', () => {
    renderTabBar();

    const bar = screen.getByRole('group', { name: 'Document tabs' });
    expect(bar).toHaveAttribute('data-bar-overflow', 'scroll');
    expect(bar.querySelector('[role="tablist"]')).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByLabelText('Modified')).toBeInTheDocument();
});

function setHorizontalBounds(element: Element, left: number, right: number): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: (): DOMRect => new DOMRect(left, 0, right - left, 30),
    });
}

it('reveals a newly active tab by scrolling only the hidden distance', () => {
    const callbacks = {
        onActivate: jest.fn(),
        onAdd: jest.fn(),
        onClose: jest.fn(),
        onContextMenu: jest.fn(),
        onReorder: jest.fn(),
    };
    const { rerender } = render(<TabBar ariaLabel="Document tabs" tabs={tabs} {...callbacks} />);
    const strip = screen.getByRole('tablist', { name: 'Document tabs' });
    const third = screen.getByRole('tab', { name: 'Three' });
    setHorizontalBounds(strip, 0, 100);
    setHorizontalBounds(third.parentElement as Element, 80, 145);

    rerender(
        <TabBar
            ariaLabel="Document tabs"
            tabs={tabs.map((tab) => ({ ...tab, active: tab.id === 'three' }))}
            {...callbacks}
        />,
    );

    expect(strip.scrollLeft).toBe(45);
});

it('reveals a newly opened tab added past the visible strip', () => {
    const callbacks = {
        onActivate: jest.fn(),
        onAdd: jest.fn(),
        onClose: jest.fn(),
        onContextMenu: jest.fn(),
        onReorder: jest.fn(),
    };
    const newTab: TabBarTab = {
        active: true,
        dirty: false,
        id: 'four',
        label: 'Four',
        readOnly: false,
    };
    const onTabRef = (documentId: string, element: HTMLButtonElement | null): void => {
        if (documentId === 'four' && element?.parentElement) {
            setHorizontalBounds(element.parentElement, 115, 165);
        }
    };
    const { rerender } = render(<TabBar ariaLabel="Document tabs" tabs={tabs} {...callbacks} onTabRef={onTabRef} />);
    const strip = screen.getByRole('tablist', { name: 'Document tabs' });
    setHorizontalBounds(strip, 0, 100);

    rerender(
        <TabBar
            ariaLabel="Document tabs"
            tabs={[...tabs.map((tab) => ({ ...tab, active: false })), newTab]}
            {...callbacks}
            onTabRef={onTabRef}
        />,
    );

    expect(strip.scrollLeft).toBe(65);
});

it('reveals an already active tab when it is activated again', () => {
    const callbacks = renderTabBar();
    const strip = screen.getByRole('tablist', { name: 'Document tabs' });
    const first = screen.getByRole('tab', { name: 'One' });
    strip.scrollLeft = 60;
    setHorizontalBounds(strip, 0, 100);
    setHorizontalBounds(first.parentElement as Element, -35, 20);

    fireEvent.click(first);

    expect(callbacks.onActivate).toHaveBeenCalledWith('one');
    expect(strip.scrollLeft).toBe(25);
});

it('does not move the tab strip when the active tab is already fully visible', () => {
    const callbacks = renderTabBar();
    const strip = screen.getByRole('tablist', { name: 'Document tabs' });
    const first = screen.getByRole('tab', { name: 'One' });
    strip.scrollLeft = 20;
    setHorizontalBounds(strip, 0, 100);
    setHorizontalBounds(first.parentElement as Element, 15, 85);

    fireEvent.click(first);

    expect(callbacks.onActivate).toHaveBeenCalledWith('one');
    expect(strip.scrollLeft).toBe(20);
});

it('preserves manual tab-strip scrolling when an unrelated tab property changes', () => {
    const callbacks = {
        onActivate: jest.fn(),
        onAdd: jest.fn(),
        onClose: jest.fn(),
        onContextMenu: jest.fn(),
        onReorder: jest.fn(),
    };
    const { rerender } = render(<TabBar ariaLabel="Document tabs" tabs={tabs} {...callbacks} />);
    const strip = screen.getByRole('tablist', { name: 'Document tabs' });
    const first = screen.getByRole('tab', { name: 'One' });
    strip.scrollLeft = 40;
    setHorizontalBounds(strip, 0, 100);
    setHorizontalBounds(first.parentElement as Element, -35, 20);

    rerender(
        <TabBar
            ariaLabel="Document tabs"
            tabs={tabs.map((tab) => (tab.id === 'two' ? { ...tab, dirty: true } : tab))}
            {...callbacks}
        />,
    );

    expect(strip.scrollLeft).toBe(40);
});

it('reveals repeated successful open requests for the same active tab', () => {
    const callbacks = {
        onActivate: jest.fn(),
        onAdd: jest.fn(),
        onClose: jest.fn(),
        onContextMenu: jest.fn(),
        onReorder: jest.fn(),
    };
    const { rerender } = render(<TabBar ariaLabel="Document tabs" tabs={tabs} {...callbacks} />);
    const strip = screen.getByRole('tablist', { name: 'Document tabs' });
    const first = screen.getByRole('tab', { name: 'One' });
    setHorizontalBounds(strip, 0, 100);
    setHorizontalBounds(first.parentElement as Element, -35, 20);
    strip.scrollLeft = 40;

    rerender(
        <TabBar
            ariaLabel="Document tabs"
            tabs={tabs}
            {...callbacks}
            revealRequest={{ documentId: 'one', sequence: 1 }}
        />,
    );
    expect(strip.scrollLeft).toBe(5);

    strip.scrollLeft = 40;
    rerender(
        <TabBar
            ariaLabel="Document tabs"
            tabs={tabs}
            {...callbacks}
            revealRequest={{ documentId: 'one', sequence: 2 }}
        />,
    );
    expect(strip.scrollLeft).toBe(5);
});

it('ignores a late reveal request for a tab that is no longer active', () => {
    const callbacks = {
        onActivate: jest.fn(),
        onAdd: jest.fn(),
        onClose: jest.fn(),
        onContextMenu: jest.fn(),
        onReorder: jest.fn(),
    };
    const { rerender } = render(<TabBar ariaLabel="Document tabs" tabs={tabs} {...callbacks} />);
    const strip = screen.getByRole('tablist', { name: 'Document tabs' });
    const second = screen.getByRole('tab', { name: 'Two' });
    strip.scrollLeft = 40;
    setHorizontalBounds(strip, 0, 100);
    setHorizontalBounds(second.parentElement as Element, 110, 160);

    rerender(
        <TabBar
            ariaLabel="Document tabs"
            tabs={tabs}
            {...callbacks}
            revealRequest={{ documentId: 'two', sequence: 1 }}
        />,
    );

    expect(strip.scrollLeft).toBe(40);
});
