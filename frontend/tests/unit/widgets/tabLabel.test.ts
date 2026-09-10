import type { DocumentMetadata } from '../../../src/logic/store/appModelTypes';
import {
  escapeUnsafeText,
  tabLabelFor,
  truncateTabLabel,
  truncatedTabLabelParts,
} from '../../../src/ui/widgets/tabLabel';

function documentFor(documentId: string, path: string): DocumentMetadata {
  return {
    documentId,
    title: path.split('/').at(-1) ?? 'Untitled',
    path,
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

it('identical parents extend the suffix until unique', () => {
  const one = documentFor('one', '/repo/left/shared/readme.md');
  const two = documentFor('two', '/repo/right/shared/readme.md');
  const first = tabLabelFor(one, [one, two]);
  const second = tabLabelFor(two, [one, two]);

  expect(first.suffix).toContain('left/shared');
  expect(second.suffix).toContain('right/shared');
});

it('control and bidirectional characters render as visible escapes', () => {
  expect(escapeUnsafeText(`bad\u0000\u007f\u202e.md`)).toBe(
    'bad\\u0000\\u007F\\u202E.md',
  );
  expect(
    tabLabelFor(documentFor('hostile', '/tmp/bad\u202E.md'), [
      documentFor('hostile', '/tmp/bad\u202E.md'),
    ]).label,
  ).toContain('\\u202E');
});

it('disambiguates a hostile basename against its sanitized sibling', () => {
  const hostile = documentFor('hostile', '/tmp/projects/alpha/notes\u202E.md');
  const sibling = documentFor('sibling', '/tmp/projects/beta/notes.md');

  expect(tabLabelFor(hostile, [hostile, sibling]).suffix).toContain('alpha');
  expect(tabLabelFor(sibling, [hostile, sibling]).suffix).toContain('beta');
});

it('ellipsis retains a distinguishing suffix and the complete label stays accessible', () => {
  const label = tabLabelFor(
    documentFor('one', '/repo/first/very-long-name.md'),
    [
      documentFor('one', '/repo/first/very-long-name.md'),
      documentFor('two', '/repo/second/very-long-name.md'),
    ],
  );
  const visual = truncateTabLabel(label, 18);

  expect(visual).toContain('…');
  expect(visual).toContain('first');
  expect(label.accessibleName).toBe(label.label);
});

/*
 * : the split is what lets the layout give the *pixel* ellipsis to the
 * basename. A joined string cannot express that, and the pixel budget clips its
 * trailing edge — which is where the distinguishing suffix sits.
 */
// separator so the suffix is addressable. That the suffix then survives the
// pixel clip is a layout property and is proved in the browser by
// 'keeps the distinguishing suffix painted…' in real-files-and-tabs.test.ts.)
it('splits the visual tab label at the separator so the suffix is its own part', () => {
  const documents = [
    documentFor('one', '/repo/first/very-long-name.md'),
    documentFor('two', '/repo/second/very-long-name.md'),
  ];
  const label = tabLabelFor(documents[0] as DocumentMetadata, documents);
  const parts = truncatedTabLabelParts(label, 18);

  expect(parts.basename).toContain('…');
  expect(parts.suffix).toBe(' — ⁨first⁩');
  expect(`${parts.basename}${parts.suffix}`).toBe(truncateTabLabel(label, 18));
});

// the tab strip renders as one text node, which is what keeps the parity
// fixtures' computed styles unchanged.)
it('leaves an unambiguous label as a single part with no suffix', () => {
  const only = documentFor('one', '/repo/first/notes.md');
  const parts = truncatedTabLabelParts(tabLabelFor(only, [only]), 42);

  expect(parts.suffix).toBe('');
  expect(parts.basename).toBe('⁨notes.md⁩');
});
