import {
  createSettingsAdapter,
  type SettingsBindings,
} from '../../../src/logic/adapter/services';

it('keeps EditorSettings DTO and binding arity parity', async () => {
  const updateEditor = jest.fn(
    async (settings: {
      lineNumbers: boolean;
      wordWrap: boolean;
      fontSize: number;
    }) => {
      void settings;
      return {};
    },
  );
  const bindings: SettingsBindings = {
    getSettings: jest.fn(async () => ({
      data: {
        appearance: {
          theme: 'material',
          mode: 'auto',
          defaultOpenMode: 'editor',
        },
        markdown: {
          standard: 'gfm',
          formatOnSave: false,
          lintOnSave: false,
          bulletMarker: '-',
          emphasisMarker: '_',
          headingStyle: 'atx',
        },
        contentPrivacy: { remotePolicy: 'ask' },
        editor: { lineNumbers: true, wordWrap: false, fontSize: 14 },
      },
    })),
    updateAppearance: jest.fn(),
    resetAppearance: jest.fn(),
    updateContentPrivacy: jest.fn(),
    updateMarkdown: jest.fn(),
    updateEditor,
    updateFile: jest.fn(),
  };
  const adapter = createSettingsAdapter(bindings);

  await expect(adapter.getSettings()).resolves.toMatchObject({
    editor: { lineNumbers: true, wordWrap: false, fontSize: 14 },
  });
  await expect(
    adapter.updateEditor({ lineNumbers: false, wordWrap: true, fontSize: 16 }),
  ).resolves.toBeUndefined();
  expect(updateEditor).toHaveBeenCalledWith({
    lineNumbers: false,
    wordWrap: true,
    fontSize: 16,
  });
});
