import { fireEvent, render, screen } from '@testing-library/react';

import type {
  DocumentMetadata,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import TabContextMenu from './TabContextMenu';

function documentFor(documentId: string): DocumentMetadata {
  return {
    documentId,
    title: `${documentId}.md`,
    path: `/tmp/${documentId}.md`,
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 0,
    view: {
      arrangement: 'editor',
      editorVisible: true,
      previewVisible: false,
      cursor: { line: 1, column: 1 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
      scroll: { editor: 0, preview: 0 },
    },
  };
}

it('dispatches a target move through the typed context action', () => {
  const first = documentFor('first');
  const second = documentFor('second');
  const onAction = jest.fn(async (): Promise<TabTransitionResult> => ({
    status: 'reordered',
    orderedDocumentIds: ['second', 'first'],
  }));
  render(
    <TabContextMenu
      adapter={{}}
      document={second}
      index={1}
      onAction={onAction}
      onClose={jest.fn()}
      orderedDocuments={[first, second]}
      tabSetRevision={7}
    />,
  );

  fireEvent.click(screen.getByRole('menuitem', { name: 'Move tab left' }));

  expect(onAction).toHaveBeenCalledWith('move-tab-left', second, 0);
});

it('focuses the first action without scrolling the parity viewport', () => {
  const focus = jest.spyOn(HTMLElement.prototype, 'focus');

  render(
    <TabContextMenu
      adapter={{}}
      document={documentFor('first')}
      index={0}
      onAction={jest.fn(async (): Promise<TabTransitionResult> => ({
        status: 'closed',
        activeDocumentId: undefined,
        orderedDocumentIds: [],
      }))}
      onClose={jest.fn()}
      orderedDocuments={[documentFor('first')]}
      tabSetRevision={7}
    />,
  );

  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  focus.mockRestore();
});
