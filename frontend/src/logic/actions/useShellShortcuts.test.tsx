import { fireEvent, render } from '@testing-library/react';

import { createShellActionCatalogue } from './shellActions';
import { useShellShortcuts } from './useShellShortcuts';

const toggleFullscreen = jest.fn(async (): Promise<boolean> => true);

function Harness({ modalOpen }: { modalOpen: boolean }): null {
  useShellShortcuts(
    createShellActionCatalogue({
      modalOpen,
      viewAvailable: true,
      openSettings: jest.fn(),
      openView: jest.fn(),
      openAbout: jest.fn(),
      toggleFullscreen,
    }),
  );
  return null;
}

it('FR-WS-004 routes F11 through the catalogue and suppresses it under modality', () => {
  const { rerender } = render(<Harness modalOpen={false} />);

  fireEvent.keyDown(window, { key: 'F11' });
  expect(toggleFullscreen).toHaveBeenCalledTimes(1);

  rerender(<Harness modalOpen />);
  fireEvent.keyDown(window, { key: 'F11' });
  expect(toggleFullscreen).toHaveBeenCalledTimes(1);
});
