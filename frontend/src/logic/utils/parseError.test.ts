import { parseError, type WireError } from './parseError';

it('STORY-006-AC-3 normalizes valid and malformed wire errors plus unknown failures', () => {
  const wireError: WireError = {
    code: 'timeout',
    title: 'Timed out',
    message: 'Try again.',
    details: { retryAfter: '5s' },
    retryable: true,
  };

  expect(parseError(wireError)).toBe(wireError);
  expect(
    parseError({
      code: 'unrecognized',
      title: 'Unknown failure',
      message: 'This code is not part of the wire contract.',
      retryable: false,
    }),
  ).toEqual({
    code: 'internal',
    title: 'Something went wrong',
    message: '[object Object]',
    retryable: true,
  });
  expect(
    parseError({
      code: 'validation',
      title: 'Invalid setting',
      message: 'Details must be strings.',
      details: { retryAfter: 5 },
      retryable: false,
    }),
  ).toEqual({
    code: 'internal',
    title: 'Something went wrong',
    message: '[object Object]',
    retryable: true,
  });
  expect(parseError(new Error('disk unavailable'))).toEqual({
    code: 'internal',
    title: 'Something went wrong',
    message: 'disk unavailable',
    retryable: true,
  });
  expect(parseError('plain failure')).toEqual({
    code: 'internal',
    title: 'Something went wrong',
    message: 'plain failure',
    retryable: true,
  });
  expect(parseError(null)).toEqual({
    code: 'internal',
    title: 'Something went wrong',
    message: 'null',
    retryable: true,
  });
  expect(parseError({ reason: 'unexpected' })).toEqual({
    code: 'internal',
    title: 'Something went wrong',
    message: '[object Object]',
    retryable: true,
  });
});
