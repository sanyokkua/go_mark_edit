import { classifyLink } from '../../../src/logic/markdown/linkPolicy';

const documentPath = '/tmp/notes/readme.md';

// Proves: FR-014
it('classifies an in-document anchor without involving the document path', () => {
  expect(classifyLink('#installation', documentPath)).toEqual({
    kind: 'anchor',
    href: '#installation',
    fragment: 'installation',
  });
});

// Proves: FR-014
it('classifies accepted local documents and resolves their lexical path', () => {
  expect(classifyLink('./next.MARKDOWN#heading', documentPath)).toEqual({
    kind: 'localDocument',
    href: './next.MARKDOWN#heading',
    path: '/tmp/notes/next.MARKDOWN',
  });
});

// Proves: FR-014
it('classifies http and https links as external browser targets', () => {
  expect(classifyLink('https://example.test/guide', documentPath)).toEqual({
    kind: 'external',
    href: 'https://example.test/guide',
  });
  expect(classifyLink('http://example.test/guide', documentPath)).toEqual({
    kind: 'external',
    href: 'http://example.test/guide',
  });
});

// Proves: FR-014
it('refuses every other scheme, including javascript and data', () => {
  for (const href of [
    'mailto:team@example.test',
    'file:///tmp/notes/next.md',
    "javascript:alert('unsafe')",
    'data:text/plain,unsafe',
  ]) {
    expect(classifyLink(href, documentPath)).toEqual({
      kind: 'refused',
      href,
      reason: 'scheme',
    });
  }
});

// Proves: FR-014
it('refuses unsupported local suffixes and paths outside the document folder', () => {
  expect(classifyLink('./next.pdf', documentPath)).toEqual({
    kind: 'refused',
    href: './next.pdf',
    reason: 'unsupported-extension',
  });
  expect(classifyLink('../next.md', documentPath)).toEqual({
    kind: 'refused',
    href: '../next.md',
    reason: 'outside-document-folder',
  });
});

// Proves: FR-014
it('refuses a relative local target when the source is untitled', () => {
  expect(classifyLink('./next.md')).toEqual({
    kind: 'refused',
    href: './next.md',
    reason: 'untitled-document',
  });
});
