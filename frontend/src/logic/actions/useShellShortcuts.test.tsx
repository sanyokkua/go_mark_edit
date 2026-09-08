import { fireEvent, render } from '@testing-library/react';

import { createShellActionCatalogue } from './shellActions';
import { useShellShortcuts } from './useShellShortcuts';

const toggleFullscreen = jest.fn(async (): Promise<boolean> => true);
const toggleSidebar = jest.fn();

function Harness({ modalOpen }: { modalOpen: boolean }): null {
  useShellShortcuts(
    createShellActionCatalogue({
      modalOpen,
      viewAvailable: true,
      openSettings: jest.fn(),
      openView: jest.fn(),
      openAbout: jest.fn(),
      toggleSidebar,
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

it('T048 routes Mod+\\ Toggle Sidebar through the same catalogue', () => {
  render(<Harness modalOpen={false} />);

  fireEvent.keyDown(window, { key: '\\', ctrlKey: true });

  expect(toggleSidebar).toHaveBeenCalledTimes(1);
});

it('T056 routes the physical shifted Settings binding through the shell catalogue', () => {
  const openSettings = jest.fn();
  function SettingsHarness(): null {
    useShellShortcuts(
      createShellActionCatalogue({
        modalOpen: false,
        viewAvailable: true,
        openSettings,
        openView: jest.fn(),
        openAbout: jest.fn(),
        toggleFullscreen,
      }),
    );
    return null;
  }

  render(<SettingsHarness />);
  fireEvent.keyDown(window, {
    code: 'Comma',
    key: '<',
    ctrlKey: true,
  });

  expect(openSettings).toHaveBeenCalledTimes(1);
});

it('T061 routes the Keyboard shortcuts binding through the canonical catalogue', () => {
  const openShortcuts = jest.fn();
  function ShortcutsHarness(): null {
    useShellShortcuts(
      createShellActionCatalogue({
        modalOpen: false,
        viewAvailable: true,
        openSettings: jest.fn(),
        openView: jest.fn(),
        openAbout: jest.fn(),
        openShortcuts,
        toggleFullscreen,
      }),
    );
    return null;
  }

  render(<ShortcutsHarness />);
  fireEvent.keyDown(window, {
    code: 'Slash',
    key: '?',
    ctrlKey: true,
    shiftKey: true,
  });

  expect(openShortcuts).toHaveBeenCalledTimes(1);
});

it('T058 suppresses F11, Settings, and Toggle Sidebar while a modal is open', () => {
  const openSettings = jest.fn();
  const modalToggleSidebar = jest.fn();
  function ModalHarness(): null {
    useShellShortcuts(
      createShellActionCatalogue({
        modalOpen: true,
        viewAvailable: true,
        openSettings,
        openView: jest.fn(),
        openAbout: jest.fn(),
        toggleSidebar: modalToggleSidebar,
        toggleFullscreen,
      }),
    );
    return null;
  }

  render(<ModalHarness />);
  fireEvent.keyDown(window, { key: 'F11' });
  fireEvent.keyDown(window, { code: 'Comma', key: ',', ctrlKey: true });
  fireEvent.keyDown(window, {
    code: 'Backslash',
    key: '\\',
    ctrlKey: true,
  });

  expect(toggleFullscreen).not.toHaveBeenCalled();
  expect(openSettings).not.toHaveBeenCalled();
  expect(modalToggleSidebar).not.toHaveBeenCalled();
});
