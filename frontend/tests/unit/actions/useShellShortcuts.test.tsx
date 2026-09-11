import { fireEvent, render } from '@testing-library/react';

import { createShellActionCatalogue } from '../../../src/logic/actions/shellActions';
import {
  useShellShortcuts,
  type ShortcutAction,
} from '../../../src/logic/actions/useShellShortcuts';

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

it('routes F11 through the catalogue and suppresses it under modality', () => {
  const { rerender } = render(<Harness modalOpen={false} />);

  fireEvent.keyDown(window, { key: 'F11' });
  expect(toggleFullscreen).toHaveBeenCalledTimes(1);

  rerender(<Harness modalOpen />);
  fireEvent.keyDown(window, { key: 'F11' });
  expect(toggleFullscreen).toHaveBeenCalledTimes(1);
});

it('routes Mod+\\ Toggle Sidebar through the same catalogue', () => {
  render(<Harness modalOpen={false} />);

  fireEvent.keyDown(window, { key: '\\', ctrlKey: true });

  expect(toggleSidebar).toHaveBeenCalledTimes(1);
});

it('routes the physical shifted Settings binding through the shell catalogue', () => {
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

it('routes the Keyboard shortcuts binding through the canonical catalogue', () => {
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

it('suppresses F11, Settings, and Toggle Sidebar while a modal is open', () => {
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

it('routes canonical file/tab shortcuts through typed actions', () => {
  const invoke = jest.fn(async () => ({ status: 'closed' }));
  const action: ShortcutAction = {
    id: 'close-tab',
    invoke,
    isAvailable: () => true,
    shortcut: 'Mod+W',
    dispatchContext: {
      applicationFocused: true,
      documentId: 'doc-1',
      projectedState: {
        activeDocumentId: 'doc-1',
        orderedDocumentIds: ['doc-1', 'doc-2'],
        documents: { 'doc-1': { capability: 'writable' } },
      },
    },
  };

  function CanonicalHarness(): null {
    useShellShortcuts([action]);
    return null;
  }

  render(<CanonicalHarness />);
  fireEvent.keyDown(window, { key: 'w', ctrlKey: true });

  expect(invoke).toHaveBeenCalledTimes(1);
});
