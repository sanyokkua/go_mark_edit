import { classifyImageSource } from '../../../src/logic/markdown/imagePolicy';

const documentPath = '/tmp/notes/readme.md';

it('classifies an in-folder relative image as a local source', () => {
  expect(classifyImageSource('./images/inside.png', documentPath)).toEqual({
    kind: 'local',
    path: '/tmp/notes/images/inside.png',
    source: './images/inside.png',
  });
});

it('keeps web, absolute, and outside image sources as placeholders', () => {
  expect(
    classifyImageSource('https://example.test/image.png', documentPath),
  ).toMatchObject({
    kind: 'placeholder',
    reason: 'scheme',
  });
  expect(
    classifyImageSource('/tmp/notes/image.png', documentPath),
  ).toMatchObject({
    kind: 'placeholder',
    reason: 'absolute-path',
  });
  expect(classifyImageSource('../outside.png', documentPath)).toMatchObject({
    kind: 'placeholder',
    reason: 'outside-document-folder',
  });
});

it('keeps an image source from an untitled document as a placeholder', () => {
  expect(classifyImageSource('./inside.png')).toMatchObject({
    kind: 'placeholder',
    reason: 'untitled-document',
  });
});
