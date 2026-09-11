import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const tokenFile = resolve(repositoryRoot, 'frontend/src/ui/styles/tokens.css');
const scannedExtensions = new Set([
  '.css',
  '.cjs',
  '.js',
  '.mjs',
  '.ts',
  '.tsx',
]);

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

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function collectDeclared(source) {
  const declarations = new Map();
  const declarationPattern = /^\s*(--[A-Za-z][\w-]*)\s*:/gm;
  for (const match of source.matchAll(declarationPattern)) {
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

const declared = collectDeclared(
  withoutComments(await readFile(tokenFile, 'utf8')),
);
const allDeclared = new Map(declared);
const referenced = new Map();
const files = [
  ...(await Array.fromAsync(
    filesUnder(resolve(repositoryRoot, 'frontend/src')),
  )),
  ...(await Array.fromAsync(
    filesUnder(resolve(repositoryRoot, 'frontend/public')),
  )),
  ...(await Array.fromAsync(
    filesUnder(resolve(repositoryRoot, 'frontend/scripts')),
  )),
];

for (const path of files) {
  const source = withoutComments(await readFile(path, 'utf8'));
  for (const match of source.matchAll(/^\s*(--[A-Za-z][\w-]*)\s*:/gm)) {
    allDeclared.set(match[1], true);
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
for (const name of [...declared.keys()].sort()) {
  if (referenced.has(name)) continue;
  failures += 1;
  console.log(
    `tokens L21 ${relative(repositoryRoot, tokenFile)}: ${name} is declared but never referenced`,
  );
}

for (const [name, paths] of [...referenced.entries()].sort()) {
  if (allDeclared.has(name)) continue;
  failures += 1;
  console.log(
    `tokens L21 ${relative(repositoryRoot, paths[0])}: ${name} is referenced but not declared`,
  );
}

if (failures > 0) {
  console.log(`tokens: ${failures} finding(s)`);
  process.exit(1);
}
console.log(`tokens L21: ok (${declared.size} token(s))`);
