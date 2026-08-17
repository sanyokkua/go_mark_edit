import { fireEvent, render, screen } from '@testing-library/react';

import type {
  DocumentMetadata,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import {
  getActionAvailability,
  type ActionAvailabilityContext,
  type ActionId,
} from '../../logic/actions/actionRegistry';
import { currentPlatform } from '../../logic/actions/shortcutRegistry';
import TabContextMenu from './TabContextMenu';

/*
 * T143: the accelerator this menu draws must come from the registry binding
 * rendered for the running platform. Only a platform the host is not can
 * distinguish a derivation from a literal that happens to agree, so the
 * platform read is the seam the test controls.
 */
jest.mock('../../logic/actions/shortcutRegistry', () => {
  const actual = jest.requireActual('../../logic/actions/shortcutRegistry');
  return {
    __esModule: true,
    ...actual,
    currentPlatform: jest.fn(actual.currentPlatform),
  };
});

const platformMock = currentPlatform as jest.MockedFunction<
  typeof currentPlatform
>;

/*
 * T152: the point of the refactor is that the menu asks the registry rather
 * than recomputing the rules, and the only way to prove *sourcing* — as
 * opposed to agreement, which held before the change too — is to make the
 * registry answer something the old inline arithmetic never would.
 */
jest.mock('../../logic/actions/actionRegistry', () => {
  const actual = jest.requireActual('../../logic/actions/actionRegistry');
  return {
    __esModule: true,
    ...actual,
    getActionAvailability: jest.fn(actual.getActionAvailability),
  };
});

const realAvailability = jest.requireActual<
  typeof import('../../logic/actions/actionRegistry')
>('../../logic/actions/actionRegistry').getActionAvailability;

const availabilityMock = getActionAvailability as jest.MockedFunction<
  typeof getActionAvailability
>;

beforeEach(() => {
  availabilityMock.mockReset();
  availabilityMock.mockImplementation(realAvailability);
  platformMock.mockReset();
  platformMock.mockReturnValue('linux');
});

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

const MENU_ACTIONS: readonly ActionId[] = [
  'close-tab',
  'close-others',
  'close-right',
  'move-tab-left',
  'move-tab-right',
  'copy-path',
  'reveal-in-file-manager',
];

function contextFor(
  actionId: ActionId,
  target: DocumentMetadata,
  index: number,
  ordered: readonly DocumentMetadata[],
): ActionAvailabilityContext {
  return {
    documentId: target.documentId,
    projectedState: {
      documents: Object.fromEntries(
        ordered.map((entry) => [
          entry.documentId,
          { detached: entry.detached === true, path: entry.path },
        ]),
      ),
      orderedDocumentIds: ordered.map((entry) => entry.documentId),
    },
    tabCommand: true,
    targetDocumentId: target.documentId,
    ...(actionId === 'move-tab-left'
      ? { targetIndex: index - 1 }
      : actionId === 'move-tab-right'
        ? { targetIndex: index + 1 }
        : {}),
  };
}

function disabledIdsInDom(): ReadonlySet<string> {
  const disabled = new Set<string>();
  for (const item of screen.getAllByRole('menuitem', { hidden: true })) {
    const id = item.getAttribute('data-action-id');
    if (id !== null && item.hasAttribute('disabled')) disabled.add(id);
  }
  return disabled;
}

// Proves: FR-FT-037 — availability *sourcing* only. The edge and untitled
// rules themselves are proved by actionRegistry.test.ts; this asserts the menu
// reports whatever the registry decides, which is the property the inline copy
// could not have.
it('T152 disables a menu item the registry calls unavailable, whatever the local indices say', () => {
  const first = documentFor('first');
  const second = documentFor('second');
  availabilityMock.mockImplementation((id) =>
    id === 'copy-path'
      ? { kind: 'unavailable', reason: 'deferred' }
      : { kind: 'available' },
  );

  render(
    <TabContextMenu
      adapter={{}}
      document={first}
      index={0}
      onAction={jest.fn(async (): Promise<TabTransitionResult> => ({
        status: 'reordered',
        orderedDocumentIds: ['first', 'second'],
      }))}
      onClose={jest.fn()}
      orderedDocuments={[first, second]}
      tabSetRevision={7}
    />,
  );

  // `first` is path-backed and at index 0 of two, so every inline rule the
  // component used to carry would have left Copy path enabled.
  expect(screen.getByRole('menuitem', { name: 'Copy path' })).toBeDisabled();
  expect(availabilityMock).toHaveBeenCalledWith(
    'copy-path',
    expect.objectContaining({ targetDocumentId: 'first' }),
  );
});

// Proves: FR-FT-037 — the drift guard. If the menu ever stops agreeing with
// `getActionAvailability` for any tab-context action, in any of these
// positions, this fails.
it('T152 matches getActionAvailability for every tab-context action and strip position', () => {
  const first = documentFor('first');
  const middle = documentFor('middle');
  const last = documentFor('last');
  const untitled: DocumentMetadata = { ...documentFor('untitled'), path: '' };
  const detached: DocumentMetadata = {
    ...documentFor('detached'),
    detached: true,
  };
  const strips: { ordered: DocumentMetadata[]; index: number }[] = [
    { ordered: [first], index: 0 },
    { ordered: [first, middle, last], index: 0 },
    { ordered: [first, middle, last], index: 1 },
    { ordered: [first, middle, last], index: 2 },
    { ordered: [first, untitled, last], index: 1 },
    { ordered: [first, detached, last], index: 1 },
  ];

  for (const { ordered, index } of strips) {
    const target = ordered[index] as DocumentMetadata;
    const expected = new Set(
      MENU_ACTIONS.filter(
        (actionId) =>
          realAvailability(
            actionId,
            contextFor(actionId, target, index, ordered),
          ).kind !== 'available',
      ),
    );
    const view = render(
      <TabContextMenu
        adapter={{}}
        document={target}
        index={index}
        onAction={jest.fn(async (): Promise<TabTransitionResult> => ({
          status: 'reordered',
          orderedDocumentIds: ordered.map((entry) => entry.documentId),
        }))}
        onClose={jest.fn()}
        orderedDocuments={ordered}
        tabSetRevision={7}
      />,
    );

    expect({
      index,
      ordered: ordered.map((entry) => entry.documentId),
      disabled: [...disabledIdsInDom()].sort(),
    }).toEqual({
      index,
      ordered: ordered.map((entry) => entry.documentId),
      disabled: [...expected].sort(),
    });
    view.unmount();
  }
});

/*
 * T173. The three `T143 draws the close-tab accelerator …` cases were removed
 * here, and the reason belongs on the record rather than in a commit message.
 *
 * They rendered the menu on `?parity-case` and asserted the accelerator was
 * derived from the action registry for the running platform. The derivation was
 * real and the assertion was correct — but the accelerator was rendered **only**
 * on that route. The shipped tab context menu advertises no accelerator on any
 * row, so the anchor `Proves: FR-FT-047` described a surface no user reaches.
 *
 * Deleting the route branch preserves production exactly as it shipped; adding
 * the accelerator to production would have been a UI change with no requirement
 * behind it. Whether the menu *should* advertise its accelerators — the
 * reference mockup does — is a product question, filed as T190.
 */
