import type {
  DocumentCommandAPI,
  DocumentCommandResult,
} from '../../../src/logic/hooks/useDocumentCommands';
import {
  runFormatAction,
  type MarkdownMarkerPreferences,
} from '../../../src/logic/format/formatting';

const markers: MarkdownMarkerPreferences = {
  bulletMarker: '-',
  emphasisMarker: '*',
  headingStyle: 'atx',
};

function commands(replaceRange: jest.Mock): DocumentCommandAPI {
  return {
    getContent: (): DocumentCommandResult<string> => ({
      status: 'available',
      value: 'hello',
    }),
    getSelection: () => ({
      status: 'available',
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 6 },
      },
    }),
    replaceRange,
  } as DocumentCommandAPI;
}

it('runs every registered formatting action through one command runner', () => {
  const replaceRange = jest.fn(() => ({ status: 'available' }));

  const result = runFormatAction({
    actionId: 'bold',
    commands: commands(replaceRange),
    markers,
  });

  expect(result.status).toBe('available');
  expect(replaceRange).toHaveBeenCalledTimes(1);
  expect(replaceRange.mock.calls[0]?.[1]).toBe('**hello**');
});

it('refuses an action that is not a registered formatter without mutating the document', () => {
  const replaceRange = jest.fn(() => ({ status: 'available' }));

  const result = runFormatAction({
    actionId: 'format',
    commands: commands(replaceRange),
    markers,
  });

  expect(result).toEqual({ status: 'unavailable' });
  expect(replaceRange).not.toHaveBeenCalled();
});
