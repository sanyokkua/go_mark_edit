import type { DocumentMetadata } from '../../logic/store/appModelTypes';
import { escapeUnsafeText, tabLabelFor, truncateTabLabel } from './tabLabel';

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
