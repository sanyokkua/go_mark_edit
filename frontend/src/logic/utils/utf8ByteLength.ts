/** Count the UTF-8 bytes produced when encoding a JavaScript string. */
export function utf8ByteLength(content: string): number {
    let size = 0;
    for (const character of content) {
        const codePoint = character.codePointAt(0) ?? 0;
        if (codePoint <= 0x7f) size += 1;
        else if (codePoint <= 0x7ff) size += 2;
        else if (codePoint <= 0xffff) size += 3;
        else size += 4;
    }
    return size;
}
