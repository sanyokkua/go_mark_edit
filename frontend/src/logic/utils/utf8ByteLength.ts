/** Count the UTF-8 bytes produced when encoding a JavaScript string. */
export function utf8ByteLength(content: string): number {
    let size = 0;
    for (const character of content) {
        const codePoint = character.codePointAt(0) ?? 0;
        size += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    }
    return size;
}
