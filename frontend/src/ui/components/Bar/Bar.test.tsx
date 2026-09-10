import { fireEvent, render, screen, within } from '@testing-library/react';

import Bar from './Bar';

// Proves: FR-036 — Bar exposes its three semantic slots and role contract.
it('T023 renders leading, main and trailing slots in one labelled bar', () => {
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

// Proves: FR-036 — measured menu overflow relocates main content into Popup.
it('T023 relocates measured main content into an overflow Popup', () => {
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
