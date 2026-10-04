export function makeLargeMarkdown(targetBytes: number): string {
    const sections: string[] = ['# Large document\n'];
    let bytes = Buffer.byteLength(sections[0], 'utf8');
    let index = 0;
    while (bytes < targetBytes) {
        const heading = `\n## Section ${index}\n\n`;
        const body = Array.from(
            { length: 250 },
            (_, row) => `* item ${index}-${row} with *emphasis* and prose.\n`,
        ).join('');
        const table = '\n| Name| Value|\n|---|---|\n|alpha|one|\n';
        const section = heading + body + table;
        sections.push(section);
        bytes += Buffer.byteLength(section, 'utf8');
        index++;
    }
    return sections.join('');
}

export function makeDeepLists(targetBytes: number): string {
    const lines = ['# Deep lists\n\n'];
    let bytes = Buffer.byteLength(lines[0], 'utf8');
    let index = 0;
    while (bytes < targetBytes) {
        const depth = index % 12;
        const line = `${'  '.repeat(depth)}* nested item ${index} with *emphasis* and several words of prose.\n`;
        lines.push(line);
        bytes += Buffer.byteLength(line, 'utf8');
        index++;
    }
    return lines.join('');
}
