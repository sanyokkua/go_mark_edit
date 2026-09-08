import type { SettingsAdapter } from '../adapter/services';
import { store } from './index';
import {
  bootstrapSettingsProjection,
  disposeSettingsProjection,
} from './settingsProjection';

afterEach((): void => {
  disposeSettingsProjection();
});

it('T054 hydrates Redux settings once from the acknowledged adapter authority', async () => {
  const adapter: SettingsAdapter = {
    getSettings: jest.fn(async () => ({
      appearance: {
        theme: 'material',
        mode: 'auto',
        defaultOpenMode: 'editor',
      },
      markdown: {
        standard: 'gfm',
        formatOnSave: false,
        lintOnSave: false,
        bulletMarker: '+',
        emphasisMarker: '_',
        headingStyle: 'atx',
      },
      contentPrivacy: { remotePolicy: 'ask' },
      editor: { lineNumbers: false, wordWrap: true, fontSize: 13 },
      file: { autosave: false },
    })),
    updateAppearance: jest.fn(),
    resetAppearance: jest.fn(),
    updateContentPrivacy: jest.fn(),
    updateMarkdown: jest.fn(),
    updateEditor: jest.fn(),
    updateFile: jest.fn(),
  };

  await expect(bootstrapSettingsProjection(adapter)).resolves.toBeUndefined();
  await expect(bootstrapSettingsProjection(adapter)).resolves.toBeUndefined();

  expect(adapter.getSettings).toHaveBeenCalledTimes(1);
  expect(store.getState().settings).toMatchObject({
    hydrated: true,
    editor: { lineNumbers: false, wordWrap: true, fontSize: 13 },
    file: { autosave: false },
    markdown: { bulletMarker: '+', emphasisMarker: '_' },
  });
});
