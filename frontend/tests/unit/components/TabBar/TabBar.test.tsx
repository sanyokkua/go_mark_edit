import { fireEvent, render, screen } from '@testing-library/react';

import TabBar, {
  type TabBarTab,
} from '../../../../src/ui/components/TabBar/TabBar';

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

function renderTabBar(
  overrides: Partial<React.ComponentProps<typeof TabBar>> = {},
): {
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
  render(
    <TabBar
      ariaLabel="Document tabs"
      tabs={tabs}
      {...callbacks}
      {...overrides}
    />,
  );
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
  fireEvent(
    document,
    new MouseEvent('pointermove', { bubbles: true, clientX: 140 }),
  );
  fireEvent(
    document,
    new MouseEvent('pointerup', { bubbles: true, clientX: 140 }),
  );

  expect(callbacks.onReorder).toHaveBeenCalledWith('one', 2);
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'One',
    'Two',
    'Three',
  ]);
});

it('keeps the tablist inside one labelled scrollable bar with tab state exposed', () => {
  renderTabBar();

  const bar = screen.getByRole('group', { name: 'Document tabs' });
  expect(bar).toHaveAttribute('data-bar-overflow', 'scroll');
  expect(bar.querySelector('[role="tablist"]')).not.toBeNull();
  expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute(
    'aria-readonly',
    'true',
  );
  expect(screen.getByLabelText('Modified')).toBeInTheDocument();
});
