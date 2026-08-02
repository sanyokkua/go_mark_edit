import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import { settingsAdapter } from '../../logic/adapter';
import { store } from '../../logic/store';
import AppearanceControls from './AppearanceControls';

jest.mock('../../logic/adapter', () => ({
  settingsAdapter: {
    getSettings: jest.fn(async () => ({
      appearance: {
        defaultOpenMode: 'editor',
        mode: 'auto',
        theme: 'material',
      },
      contentPrivacy: { remotePolicy: 'ask' },
      markdown: {
        bulletMarker: '-',
        emphasisMarker: '*',
        formatOnSave: false,
        headingStyle: 'atx',
        lintOnSave: false,
        standard: 'gfm',
      },
    })),
    updateAppearance: jest.fn(async (): Promise<void> => undefined),
    resetAppearance: jest.fn(async (): Promise<void> => undefined),
  },
}));

const updateAppearance =
  settingsAdapter.updateAppearance as jest.MockedFunction<
    typeof settingsAdapter.updateAppearance
  >;
const getSettings = settingsAdapter.getSettings as jest.MockedFunction<
  typeof settingsAdapter.getSettings
>;
const resetAppearance = settingsAdapter.resetAppearance as jest.MockedFunction<
  typeof settingsAdapter.resetAppearance
>;

// Proves: constraints#every-action-is-reachable-by-keyboard
it('changes appearance from keyboard reachable controls after a successful write', async (): Promise<void> => {
  render(<AppearanceControls />);

  const settings = await screen.findByRole('button', { name: 'Settings' });
  fireEvent.click(settings);
  expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Follows system' })).toBeChecked();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Appearance' }));

  const dark = screen.getByRole('radio', { name: 'Dark' });
  dark.focus();
  fireEvent.keyDown(dark, { key: ' ' });

  await waitFor((): void => {
    expect(dark).toBeChecked();
  });
  expect(document.documentElement).toHaveAttribute('data-mode', 'dark');
  expect(updateAppearance).toHaveBeenCalledWith({
    defaultOpenMode: 'editor',
    mode: 'dark',
    theme: 'material',
  });
});

// Proves: all#end-to-end
it('leaves both controls and the root palette unchanged when persistence rejects', async (): Promise<void> => {
  updateAppearance.mockRejectedValueOnce(new Error('write failed'));
  render(<AppearanceControls />);

  const settings = await screen.findByRole('button', { name: 'Settings' });
  fireEvent.click(settings);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Glass' }));

  await waitFor((): void => {
    expect(updateAppearance).toHaveBeenCalled();
  });
  expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked();
  expect(document.documentElement).toHaveAttribute('data-theme', 'material');
});

// Proves: all#end-to-end
it('serializes rapid changes using the complete latest appearance choice', async (): Promise<void> => {
  let releaseFirstWrite: (() => void) | undefined;
  updateAppearance
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve): void => {
          releaseFirstWrite = resolve;
        }),
    )
    .mockResolvedValueOnce();
  render(<AppearanceControls />);

  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Glass' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

  await waitFor((): void => {
    expect(updateAppearance).toHaveBeenCalledWith({
      defaultOpenMode: 'editor',
      mode: 'auto',
      theme: 'glass',
    });
  });
  releaseFirstWrite?.();

  await waitFor((): void => {
    expect(updateAppearance).toHaveBeenLastCalledWith({
      defaultOpenMode: 'editor',
      mode: 'dark',
      theme: 'glass',
    });
    expect(document.documentElement).toHaveAttribute('data-theme', 'glass');
    expect(document.documentElement).toHaveAttribute('data-mode', 'dark');
  });
});

// Proves: themes-and-appearance#three-themes
it('normalizes invalid persisted values before exposing controls or root attributes', async (): Promise<void> => {
  getSettings.mockResolvedValueOnce({
    appearance: {
      defaultOpenMode: 'editor',
      mode: 'future',
      theme: 'dracula',
    },
    contentPrivacy: { remotePolicy: 'ask' },
    markdown: {
      bulletMarker: '-',
      emphasisMarker: '*',
      formatOnSave: false,
      headingStyle: 'atx',
      lintOnSave: false,
      standard: 'gfm',
    },
  });
  render(<AppearanceControls />);

  await waitFor((): void => {
    expect(document.documentElement).toHaveAttribute('data-theme', 'material');
    expect(document.documentElement).toHaveAttribute('data-mode', 'light');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Follows system' })).toBeChecked();
});

it('owns one Auto listener, ignores a later system change while pinned, and stays silent on success', async (): Promise<void> => {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media = {
    matches: false,
    addEventListener: jest.fn(
      (_type: string, listener: (event: { matches: boolean }) => void) =>
        listeners.add(listener),
    ),
    removeEventListener: jest.fn(
      (_type: string, listener: (event: { matches: boolean }) => void) =>
        listeners.delete(listener),
    ),
  };
  const matchMedia = jest.fn(() => media);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  });

  render(<AppearanceControls />);
  await screen.findByRole('button', { name: 'Settings' });
  expect(listeners.size).toBe(1);

  for (const listener of listeners) listener({ matches: true });
  expect(document.documentElement).toHaveAttribute('data-mode', 'dark');

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
  await waitFor(() =>
    expect(media.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    ),
  );
  expect(document.documentElement).toHaveAttribute('data-mode', 'light');
  expect(listeners.size).toBe(0);
  expect(store.getState().notifications.items).toHaveLength(0);
});

// Proves: FR-WS-015
it('updates synchronized quick and modal Appearance only after reset is acknowledged', async () => {
  getSettings.mockResolvedValueOnce({
    appearance: {
      defaultOpenMode: 'viewer',
      mode: 'dark',
      theme: 'minimal',
    },
    contentPrivacy: { remotePolicy: 'ask' },
    markdown: {
      bulletMarker: '-',
      emphasisMarker: '*',
      formatOnSave: false,
      headingStyle: 'atx',
      lintOnSave: false,
      standard: 'gfm',
    },
  });
  let acknowledgeReset: (() => void) | undefined;
  resetAppearance.mockImplementationOnce(
    () =>
      new Promise<void>((resolve): void => {
        acknowledgeReset = resolve;
      }),
  );
  render(<AppearanceControls />);

  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('radio', { name: 'Minimal' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }));
  expect(screen.getByRole('radio', { name: 'Minimal' })).toBeChecked();

  acknowledgeReset?.();
  await waitFor((): void => {
    expect(screen.getByRole('radio', { name: 'Material' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Follows system' })).toBeChecked();
  });
  expect(document.documentElement).toHaveAttribute('data-theme', 'material');
  expect(resetAppearance).toHaveBeenCalledTimes(1);
});

// Proves: FR-WS-015
it('retains acknowledged Appearance when the transactional reset is rejected', async () => {
  getSettings.mockResolvedValueOnce({
    appearance: {
      defaultOpenMode: 'viewer',
      mode: 'dark',
      theme: 'minimal',
    },
    contentPrivacy: { remotePolicy: 'ask' },
    markdown: {
      bulletMarker: '-',
      emphasisMarker: '*',
      formatOnSave: false,
      headingStyle: 'atx',
      lintOnSave: false,
      standard: 'gfm',
    },
  });
  resetAppearance.mockRejectedValueOnce(new Error('private database path'));
  render(<AppearanceControls />);

  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset appearance' }));

  await waitFor((): void => expect(resetAppearance).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('radio', { name: 'Minimal' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(document.body).not.toHaveTextContent('private database path');
});

// Proves: FR-WS-015
it('does not broadcast a reset into another mounted acknowledged Appearance projection', async () => {
  const persisted: Awaited<ReturnType<typeof settingsAdapter.getSettings>> = {
    appearance: {
      defaultOpenMode: 'viewer',
      mode: 'dark',
      theme: 'minimal',
    },
    contentPrivacy: { remotePolicy: 'ask' },
    markdown: {
      bulletMarker: '-',
      emphasisMarker: '*',
      formatOnSave: false,
      headingStyle: 'atx',
      lintOnSave: false,
      standard: 'gfm',
    },
  };
  getSettings.mockResolvedValueOnce(persisted).mockResolvedValueOnce(persisted);
  const first = render(<AppearanceControls />);
  const second = render(<AppearanceControls />);

  fireEvent.click(
    await within(first.container).findByRole('button', { name: 'Settings' }),
  );
  fireEvent.click(
    within(first.container).getByRole('menuitem', { name: 'Appearance' }),
  );
  fireEvent.click(
    within(first.container).getByRole('button', { name: 'Reset appearance' }),
  );
  await waitFor(() =>
    expect(
      within(first.container).getByRole('radio', { name: 'Material' }),
    ).toBeChecked(),
  );

  fireEvent.click(
    await within(second.container).findByRole('button', { name: 'Settings' }),
  );
  expect(
    within(second.container).getByRole('radio', { name: 'Minimal' }),
  ).toBeChecked();
  expect(
    within(second.container).getByRole('radio', { name: 'Dark' }),
  ).toBeChecked();
});
