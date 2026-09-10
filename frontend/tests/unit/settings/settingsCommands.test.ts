import type { AppearanceSettings } from '../../../src/logic/adapter/settingsTypes';
import {
  acknowledgeAppearanceSettingsUpdate,
  createSettingsCommandOwner,
  resetAppearanceSettings,
} from '../../../src/logic/settings/settingsCommands';

const current: AppearanceSettings = {
  defaultOpenMode: 'editor',
  mode: 'auto',
  theme: 'material',
};

it('acknowledges an appearance projection only after persistence succeeds', async () => {
  const acknowledge = jest.fn();
  let release: (() => void) | undefined;
  const adapter = {
    updateAppearance: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    ),
  };

  const update = acknowledgeAppearanceSettingsUpdate(
    adapter,
    current,
    { mode: 'dark' },
    acknowledge,
  );

  await Promise.resolve();
  expect(acknowledge).not.toHaveBeenCalled();
  release?.();
  await update;

  expect(acknowledge).toHaveBeenCalledWith({
    ...current,
    mode: 'dark',
  });
});

it('retains the acknowledged appearance projection when persistence rejects', async () => {
  const acknowledge = jest.fn();
  const adapter = {
    updateAppearance: jest.fn().mockRejectedValue(new Error('write failed')),
  };

  await expect(
    acknowledgeAppearanceSettingsUpdate(
      adapter,
      current,
      { theme: 'glass' },
      acknowledge,
    ),
  ).rejects.toThrow('write failed');
  expect(acknowledge).not.toHaveBeenCalled();
});

it('applies the default appearance only after reset is acknowledged', async () => {
  const acknowledge = jest.fn();
  const adapter = {
    resetAppearance: jest.fn().mockResolvedValue(undefined),
  };

  await resetAppearanceSettings(adapter, acknowledge);

  expect(acknowledge).toHaveBeenCalledWith({
    defaultOpenMode: 'editor',
    mode: 'auto',
    theme: 'material',
  });
});

it('serializes settings writes and acknowledges them in persistence order', async () => {
  const acknowledgements: string[] = [];
  const firstAcknowledgement = jest.fn(() => {
    acknowledgements.push('first');
  });
  const secondAcknowledgement = jest.fn(() => {
    acknowledgements.push('second');
  });
  let releaseFirst: (() => void) | undefined;
  const adapter = {
    updateAppearance: jest.fn(() => {
      if (adapter.updateAppearance.mock.calls.length > 1) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    }),
    resetAppearance: jest.fn(async (): Promise<void> => undefined),
    updateEditor: jest.fn(async (): Promise<void> => undefined),
    updateFile: jest.fn(async (): Promise<void> => undefined),
    updateMarkdown: jest.fn(async (): Promise<void> => undefined),
  };
  const owner = createSettingsCommandOwner(adapter);
  const first = owner.updateAppearance(
    current,
    { theme: 'glass' },
    firstAcknowledgement,
  );
  const second = owner.updateAppearance(
    { ...current, theme: 'glass' },
    { mode: 'dark' },
    secondAcknowledgement,
  );

  await Promise.resolve();
  expect(adapter.updateAppearance).toHaveBeenCalledTimes(1);
  expect(firstAcknowledgement).not.toHaveBeenCalled();
  expect(secondAcknowledgement).not.toHaveBeenCalled();

  releaseFirst?.();
  await Promise.all([first, second]);
  expect(adapter.updateAppearance).toHaveBeenNthCalledWith(1, {
    ...current,
    theme: 'glass',
  });
  expect(adapter.updateAppearance).toHaveBeenNthCalledWith(2, {
    ...current,
    mode: 'dark',
    theme: 'glass',
  });
  expect(acknowledgements).toEqual(['first', 'second']);
});
