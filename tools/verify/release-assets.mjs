import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [root, version] = process.argv.slice(2);
if (!root || !/^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.[1-9]\d*)?$/.test(version ?? '')) {
    throw new Error('expected artifact directory and valid version');
}
const expected = ['macos-arm64.zip', 'windows-amd64.exe', 'windows-arm64.exe', 'linux-amd64', 'linux-arm64']
    .map((suffix) => `GoMarkEdit-${version}-${suffix}`)
    .sort();
/** @type {string[]} */
const files = [];
/** @param {string} dir */
function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (dir === root && entry.name === 'SHA256SUMS.txt' && entry.isFile()) continue;
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile()) files.push(path);
        else throw new Error(`unsupported artifact: ${path}`);
    }
}
visit(root);
files.sort((a, b) => basename(a).localeCompare(basename(b)));
if (files.length !== expected.length || files.some((file, i) => basename(file) !== expected[i])) {
    throw new Error('artifact inventory differs from the five expected assets');
}
const sums = files.map((file) => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${basename(file)}`);
writeFileSync(join(root, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
