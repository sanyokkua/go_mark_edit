import { fireEvent, render, screen } from '@testing-library/react';

import SettingsDialog from './SettingsDialog';

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

// Proves: FR-WS-015, FR-WS-017
it('contains only delivered Appearance controls and traps keyboard focus', () => {
  renderDialog();

  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(dialog).toHaveFocus();
  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
  expect(
    screen.getByRole('radiogroup', { name: 'Appearance' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/assistant|editor settings|files|future/i),
  ).toBeNull();

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([tabindex="-1"]), button[tabindex="0"]',
    ),
  );
  focusable.at(-1)?.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(focusable[0]).toHaveFocus();

  focusable[0].focus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(focusable.at(-1)).toHaveFocus();
});

// Proves: FR-WS-015, FR-WS-017
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
 * T173. This case survives its three siblings, and without the route.
 *
 * The rule it protects is real and was a shipped defect: at the 375px minimum
 * window a transformed shell ancestor turns a `position: fixed` dialog into an
 * absolute one and clips it, so the dialog must portal outside the application
 * frame. What made the case *look* parity-specific was that it reached the
 * surface through `?parity-case`; T138 had already made both returns portal,
 * so the route was never what the assertion depended on.
 *
 * Its three siblings went with the substituted surface they described. Two
 * asserted `.parityOverlay` and `.parityPick` rules by reading the stylesheet as
 * text — a rule no selector in the shipped application can reach. The third
 * asserted that `Material` and `Light` rendered as selected while the props said
 * `theme="glass"` and `mode="dark"`: it pinned the substituted pane's habit of
 * reporting a state the application was not in.
 */
// Proves: FR-FT-047 (partial — that the settings dialog portals outside the
// application frame at the 375px minimum window, so a transformed ancestor
// cannot clip it.)
it('T173 portals the narrow settings dialog outside the application frame', () => {
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
