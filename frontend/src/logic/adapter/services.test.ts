import { createSettingsAdapter, type SettingsBindings } from './services';

// Proves: FR-WS-015
it('acknowledges ResetAppearance through one guarded zero-arity typed binding', async () => {
  const resetAppearance = jest.fn(async () => ({}));
  const bindings: SettingsBindings = {
    getSettings: jest.fn(),
    resetAppearance,
    updateAppearance: jest.fn(),
    updateContentPrivacy: jest.fn(),
    updateMarkdown: jest.fn(),
    updateEditor: jest.fn(),
  };
  const adapter = createSettingsAdapter(bindings);

  await expect(adapter.resetAppearance()).resolves.toBeUndefined();
  expect(resetAppearance).toHaveBeenCalledTimes(1);
  expect(resetAppearance).toHaveBeenCalledWith();
});
