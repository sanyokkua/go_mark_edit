import type {
  EditorSettings,
  MarkdownSettings,
} from '../adapter/settingsTypes';
import {
  acknowledgeEditorSettingsUpdate,
  acknowledgeMarkdownSettingsUpdate,
} from './settingsCommands';

const currentEditor: EditorSettings = {
  lineNumbers: true,
  wordWrap: false,
  fontSize: 14,
};
const currentMarkdown: MarkdownSettings = {
  standard: 'gfm',
  formatOnSave: false,
  lintOnSave: false,
  bulletMarker: '-',
  emphasisMarker: '*',
  headingStyle: 'atx',
};

it('T054 retains editor projection on a rejected backend acknowledgement', async () => {
  const dispatch = jest.fn();
  const adapter = {
    updateEditor: jest.fn().mockRejectedValue(new Error('write failed')),
  };

  await expect(
    acknowledgeEditorSettingsUpdate(
      adapter,
      currentEditor,
      { fontSize: 16 },
      dispatch,
    ),
  ).rejects.toThrow('write failed');
  expect(dispatch).not.toHaveBeenCalled();
});

it('T054 dispatches Markdown projection only after backend acknowledgement', async () => {
  const dispatch = jest.fn();
  const adapter = {
    updateMarkdown: jest.fn().mockResolvedValue(undefined),
  };
  const next = { ...currentMarkdown, emphasisMarker: '_' as const };

  await expect(
    acknowledgeMarkdownSettingsUpdate(
      adapter,
      currentMarkdown,
      { emphasisMarker: '_' },
      dispatch,
    ),
  ).resolves.toBeUndefined();
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
    payload: next,
  });
});
