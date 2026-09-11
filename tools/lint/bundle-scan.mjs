import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const bundleRoot = resolve(
  process.argv[2] ?? resolve(import.meta.dirname, '../../frontend/dist'),
);
const testFile = /(?:^|[/.])(?:[^/]*\.(?:test|spec)|tests?)(?:[/.]|$)/i;
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
]);

const remoteUrl = '(https?:\\/\\/[^\\s\\"\'`)<>{}]+|\\/\\/[^\\s\\"\'`)<>{}]+)';
const resourcePatterns = {
  '.css': [
    new RegExp(
      `(?:@import\\s+(?:url\\(\\s*)?|url\\(\\s*['"]?)${remoteUrl}`,
      'gi',
    ),
  ],
  '.html': [
    new RegExp(`\\b(?:src|href|poster)\\s*=\\s*['"]\\s*${remoteUrl}`, 'gi'),
  ],
  '.js': [
    new RegExp(`\\b(?:src|href)\\s*[:=]\\s*['"]\\s*${remoteUrl}`, 'gi'),
    new RegExp(`\\b(?:src|href)\\s*:\\s*['"]\\s*${remoteUrl}`, 'gi'),
    new RegExp(
      `\\b(?:importScripts|fetch|import|Worker|SharedWorker)\\s*\\(\\s*['"]\\s*${remoteUrl}`,
      'gi',
    ),
    new RegExp(`\\bnew\\s+URL\\s*\\(\\s*['"]\\s*${remoteUrl}`, 'gi'),
    new RegExp(
      `\\.setAttribute\\s*\\(\\s*['"](?:src|href)['"]\\s*,\\s*['"]\\s*${remoteUrl}`,
      'gi',
    ),
  ],
  '.json': [],
  '.map': [],
  '.mjs': [],
  '.svg': [],
  '.ts': [],
  '.tsx': [],
};

async function* filesUnder(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      yield* filesUnder(path);
    } else {
      yield path;
    }
  }
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function sourceFindings(path, source) {
  const findingsForPath = [];
  for (const pattern of resourcePatterns[extname(path).toLowerCase()] ?? []) {
    for (const match of source.matchAll(pattern)) {
      const url = match[1] ?? match[0];
      findingsForPath.push({
        line: lineNumber(source, match.index ?? 0),
        url,
      });
    }
  }
  return findingsForPath;
}

const findings = [];
try {
  for await (const path of filesUnder(bundleRoot)) {
    const relativePath = relative(bundleRoot, path);
    if (testFile.test(relativePath)) {
      findings.push(`${relativePath}: test file in production bundle`);
      continue;
    }
    if (!textExtensions.has(extname(path).toLowerCase())) continue;
    const source = await readFile(path, 'utf8');
    for (const match of sourceFindings(path, source)) {
      findings.push(
        `${relativePath}:${match.line}: remote asset URL ${match.url}`,
      );
    }
  }
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error(
      `bundle-scan L27: bundle directory does not exist: ${bundleRoot}`,
    );
  } else {
    throw error;
  }
  process.exit(1);
}

if (findings.length > 0) {
  findings.forEach((finding) => console.log(`bundle-scan L27 ${finding}`));
  console.log(`bundle-scan: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log(`bundle-scan L27: ok (${bundleRoot})`);
