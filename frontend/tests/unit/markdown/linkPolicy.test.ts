import { classifyLink } from '../../../src/logic/markdown/linkPolicy';

const documentPath = '/tmp/notes/readme.md';

it('keeps decoded in-document anchors separate from local document targets', () => {
    expect(classifyLink('#installation')).toEqual({ kind: 'anchor', href: '#installation', fragment: 'installation' });
    expect(classifyLink('#%C3%BCber-uns')).toEqual({
        kind: 'anchor',
        href: '#%C3%BCber-uns',
        fragment: 'über-uns',
    });
    expect(classifyLink('#a%2520b')).toEqual({ kind: 'anchor', href: '#a%2520b', fragment: 'a%20b' });
});

it.each(['http://example.test/guide', 'https://example.test/guide'])(
    'classifies the web address %s as an external target',
    (href) => {
        expect(classifyLink(href, documentPath)).toEqual({ kind: 'external', href });
    },
);

it.each([
    ['./next.MARKDOWN#heading', 'heading'],
    ['../other/next.md', undefined],
    ['/tmp/outside.pdf', undefined],
    ['sub\\b.md', undefined],
    ['C:\\docs\\a.md', undefined],
    ['C:/docs/a.md', undefined],
    ['Z:\\share\\a.md', undefined],
    ['/Volumes/share/a.md', undefined],
    ['next%20page.md#part%20one', 'part one'],
])('passes the local target %s to the backend without folder or suffix decisions', (href, fragment) => {
    expect(classifyLink(href, documentPath)).toEqual(
        fragment === undefined ? { kind: 'localDocument', href } : { kind: 'localDocument', href, fragment },
    );
});

it.each(['/tmp/notes/next.md', 'C:\\docs\\a.md', 'C:/docs/a.md'])(
    'accepts the absolute local target %s from an untitled document',
    (href) => {
        expect(classifyLink(href)).toEqual({ kind: 'localDocument', href });
    },
);

it.each(['./next.md', '../next.md', 'sub\\b.md'])(
    'refuses the relative target %s from an untitled document',
    (href) => {
        expect(classifyLink(href)).toEqual({ kind: 'refused', href, reason: 'untitled-document' });
    },
);

it.each([
    '//server/share/a.md',
    '\\\\server\\share\\a.md',
    '\\\\?\\C:\\a.md',
    '\\\\.\\C:\\a.md',
    '/\\server/share/a.md',
    '\\/server/share/a.md',
    '%5C%5Cserver%5Cshare%5Ca.md',
    '%2F%2Fserver/share/a.md',
    '%5C%5C?%5CC:%5Ca.md',
])('refuses the network or device path %s on every platform', (href) => {
    expect(classifyLink(href, documentPath)).toEqual({ kind: 'refused', href, reason: 'network-path' });
    expect(classifyLink(href)).toEqual({ kind: 'refused', href, reason: 'network-path' });
});

it.each([
    'file:///tmp/notes/next.md',
    'mailto:team@example.test',
    'data:text/plain,unsafe',
    "javascript:alert('unsafe')",
    'ftp://example.test/a.md',
    'custom:a.md',
])('refuses the unsupported scheme %s', (href) => {
    expect(classifyLink(href, documentPath)).toEqual({ kind: 'refused', href, reason: 'scheme' });
});

it.each(['', '   '])('refuses the empty target %j', (href) => {
    expect(classifyLink(href, documentPath)).toEqual({ kind: 'refused', href, reason: 'empty' });
});

it.each(['#broken%', 'bad%name.md', 'next.md#broken%'])('refuses the non-decodable target %s', (href) => {
    expect(classifyLink(href, documentPath)).toEqual({ kind: 'refused', href, reason: 'malformed' });
});
