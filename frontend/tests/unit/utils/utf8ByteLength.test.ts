import { utf8ByteLength } from '../../../src/logic/utils/utf8ByteLength';

it.each([
    ['', 0],
    ['hello', 5],
    ['\u007f\u0080\u07ff\u0800', 8],
    ['é漢', 5],
    ['😀', 4],
    ['a😀漢', 8],
    ['\ud800', 3],
    ['\udc00', 3],
    ['\r\n', 2],
])('counts UTF-8 bytes for %j', (content, expected) => {
    expect(utf8ByteLength(content)).toBe(expected);
    expect(utf8ByteLength(content)).toBe(Buffer.byteLength(content, 'utf8'));
});
