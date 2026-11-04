import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const tokenFile = resolve(repositoryRoot, 'frontend/src/ui/styles/tokens.css');
const scannedExtensions = new Set(['.css', '.cjs', '.js', '.mjs', '.ts', '.tsx']);

async function* filesUnder(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            yield* filesUnder(path);
        } else if (scannedExtensions.has(extname(entry.name))) {
            yield path;
        }
    }
}

// Consume each whitespace run once, even when it spans many empty lines.
function* lineMatches(source, pattern) {
    for (const prefix of source.matchAll(/^\s*/gm)) {
        pattern.lastIndex = prefix.index + prefix[0].length;
        const match = pattern.exec(source);
        if (match) yield { match, start: prefix.index };
    }
}

function withoutComments(source) {
    let uncommented = '';
    let cursor = 0;
    while (true) {
        const start = source.indexOf('/*', cursor);
        if (start < 0) break;
        const end = source.indexOf('*/', start + 2);
        if (end < 0) break;
        uncommented += source.slice(cursor, start);
        cursor = end + 2;
    }
    source = uncommented + source.slice(cursor);
    let result = '';
    let end = 0;
    for (const { match, start } of lineMatches(source, /\/\/.*$/my)) {
        result += source.slice(end, start);
        end = match.index + match[0].length;
    }
    return result + source.slice(end);
}

function collectDeclared(source) {
    const declarations = new Map();
    for (const { match } of lineMatches(source, /(--[A-Za-z][\w-]*)\s*:/y)) {
        declarations.set(match[1], true);
    }
    return declarations;
}

function collectReferences(source) {
    const references = new Map();
    const referencePattern = /var\(\s*(--[A-Za-z][\w-]*)/g;
    for (const match of source.matchAll(referencePattern)) {
        references.set(match[1], true);
    }
    return references;
}

const declared = collectDeclared(withoutComments(await readFile(tokenFile, 'utf8')));
const allDeclared = new Map(declared);
const referenced = new Map();
const files = [
    ...(await Array.fromAsync(filesUnder(resolve(repositoryRoot, 'frontend/src')))),
    ...(await Array.fromAsync(filesUnder(resolve(repositoryRoot, 'frontend/public')))),
    ...(await Array.fromAsync(filesUnder(resolve(repositoryRoot, 'frontend/scripts')))),
];

for (const path of files) {
    const source = withoutComments(await readFile(path, 'utf8'));
    for (const name of collectDeclared(source).keys()) {
        allDeclared.set(name, true);
    }
    for (const match of source.matchAll(/['"](--[A-Za-z][\w-]*)['"]\s*:/g)) {
        allDeclared.set(match[1], true);
    }
    for (const name of collectReferences(source).keys()) {
        const entries = referenced.get(name) ?? [];
        entries.push(path);
        referenced.set(name, entries);
    }
    if (path !== tokenFile) {
        for (const match of source.matchAll(/(--[A-Za-z][\w-]*)/g)) {
            const entries = referenced.get(match[1]) ?? [];
            entries.push(path);
            referenced.set(match[1], entries);
        }
    }
}

let failures = 0;
const compareStrings = (a, b) => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
};
for (const name of [...declared.keys()].sort(compareStrings)) {
    if (referenced.has(name)) continue;
    failures += 1;
    console.log(`tokens L21 ${relative(repositoryRoot, tokenFile)}: ${name} is declared but never referenced`);
}

for (const [name, paths] of [...referenced.entries()].sort((a, b) => compareStrings(String(a), String(b)))) {
    if (allDeclared.has(name)) continue;
    failures += 1;
    console.log(`tokens L21 ${relative(repositoryRoot, paths[0])}: ${name} is referenced but not declared`);
}

if (failures > 0) {
    console.log(`tokens: ${failures} finding(s)`);
    process.exit(1);
}
console.log(`tokens L21: ok (${declared.size} token(s))`);
