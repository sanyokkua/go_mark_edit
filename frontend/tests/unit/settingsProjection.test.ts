import type { SettingsAdapter } from '../../src/logic/adapter/services';
import type { Settings } from '../../src/logic/adapter/settingsTypes';
import {
  bootstrapSettingsProjection,
  disposeSettingsProjection,
} from '../../src/logic/store/settingsProjection';

const settings: Settings = {
  appearance: { defaultOpenMode: 'editor', mode: 'auto', theme: 'material' },
  contentPrivacy: { remotePolicy: 'ask' },
  editor: { fontSize: 14, lineNumbers: true, wordWrap: false },
  file: { autosave: true },
  markdown: {
    bulletMarker: '-',
    emphasisMarker: '*',
    formatOnSave: false,
    headingStyle: 'atx',
    lintOnSave: false,
    standard: 'gfm',
  },
};

afterEach((): void => {
  disposeSettingsProjection();
});

it('starts a fresh settings read after a rejected attempt', async () => {
  const getSettings = jest
    .fn<ReturnType<SettingsAdapter['getSettings']>, []>()
    .mockRejectedValueOnce(new Error('first read failed'))
    .mockResolvedValueOnce(settings);
  const adapter = {
    getSettings,
  } as unknown as SettingsAdapter;

  await expect(bootstrapSettingsProjection(adapter)).rejects.toThrow(
    'first read failed',
  );
  await expect(bootstrapSettingsProjection(adapter)).resolves.toBeUndefined();
  expect(getSettings).toHaveBeenCalledTimes(2);
});
