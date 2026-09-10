import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

const defaultRoot = resolve(import.meta.dirname, '../..');
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.go',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
]);
const labelPattern = /\bT\d{3}\b|FR-|SC-|STORY-|Proves:/g;
const whiteBoxTests = new Set([
  'internal/file/atomic_replace_test.go',
  'internal/file/document_reader_test.go',
  'internal/appmodel/lifecycle_retention_test.go',
]);
const productionCodeExtensions = new Set(['.go', '.ts', '.tsx']);
const referenceRoots = [
  'scripts/',
  'frontend/',
  'internal/',
  'tools/',
  'tests/',
  'docs/',
  'specs/',
  '.specify/',
  '.agents/',
  '.claude/',
  '.github/',
  'build/',
];

function parseArguments(argumentsList) {
  let root = defaultRoot;
  let includeDocs = process.env.REPO_RULES_INCLUDE_DOCS === '1';
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--root') root = resolve(process.cwd(), argumentsList[++index]);
    if (argument === '--docs') includeDocs = true;
  }
  return { root, includeDocs };
}

async function* filesUnder(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      yield* filesUnder(path);
    } else if (textExtensions.has(extname(entry.name).toLowerCase())) {
      yield path;
    }
  }
}

function relativePath(root, path) {
  return relative(root, path).split(sep).join('/');
}

function isExcluded(path) {
  return (
    path === '' ||
    path.startsWith('specs/') ||
    path.startsWith('.specify/') ||
    path.startsWith('docs/audits/') ||
    path.startsWith('docs/_archive-')
  );
}

function isTestFile(path) {
  return (
    path.startsWith('frontend/tests/') ||
    path.startsWith('tests/') ||
    /(?:^|\/)internal\/[^/]+\/.*_test\.go$/.test(path) ||
    /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i.test(path)
  );
}

function isSourceFile(path) {
  if (!productionCodeExtensions.has(extname(path).toLowerCase())) return false;
  return (
    path === 'main.go' ||
    path.startsWith('internal/') ||
    path.startsWith('frontend/src/') ||
    (path.startsWith('tools/') && path !== 'tools/lint/repo-rules.mjs')
  );
}

async function scanTextFiles(root, predicate, rule) {
  const findings = [];
  for await (const path of filesUnder(root)) {
    const relativeName = relativePath(root, path);
    if (isExcluded(relativeName) || !predicate(relativeName)) continue;
    const lines = (await readFile(path, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (!labelPattern.test(line)) return;
      labelPattern.lastIndex = 0;
      findings.push({
        rule,
        path: relativeName,
        line: index + 1,
        text: line.trim(),
      });
    });
  }
  return findings;
}

function isIllegalTestPlacement(path) {
  if (path.startsWith('frontend/src/') || path.startsWith('frontend/public/')) {
    return /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i.test(path);
  }
  if (path.endsWith('_test.go') && !path.startsWith('tests/')) {
    return !whiteBoxTests.has(path);
  }
  return false;
}

function cleanCandidate(candidate) {
  return candidate
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[),.;:]+$/g, '')
    .replace(/^\.?\//, '');
}

function pathCandidate(candidate) {
  const cleaned = cleanCandidate(candidate);
  if (!cleaned || cleaned.includes('<') || cleaned.includes('*')) return null;
  if (/^(?:https?:)?\/\//i.test(cleaned)) return null;
  if (referenceRoots.some((prefix) => cleaned.startsWith(prefix))) return cleaned;
  if (/^(?:README|AGENTS|CLAUDE)\.md$|^\.golangci\.yml$|^go\.mod$|^justfile$|^package\.json$/.test(cleaned)) return cleaned;
  return null;
}

async function checkReferences(root, docs) {
  const findings = [];
  const candidates = new Map();
  const add = (candidate, path, line) => {
    const cleaned = pathCandidate(candidate);
    if (cleaned && !candidates.has(cleaned)) candidates.set(cleaned, { path, line });
  };

  for (const path of docs) {
    const source = await readFile(resolve(root, path), 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/`([^`]+)`/g)) {
        const code = match[1].trim();
        add(code.split(/\s+/)[0], path, index + 1);
        for (const command of code.matchAll(/\bscripts\/[A-Za-z0-9._/-]+/g)) {
          add(command[0], path, index + 1);
        }
      }
      for (const command of line.matchAll(/\bscripts\/[A-Za-z0-9._/-]+/g)) {
        add(command[0], path, index + 1);
      }
    });
  }

  for (const [candidate, location] of candidates) {
    let candidatePath = resolve(root, candidate);
    try {
      await stat(candidatePath);
    } catch {
      const command = candidate.split('/')[0];
      if (candidate.startsWith('scripts/') && command === 'scripts') {
        candidatePath = resolve(root, candidate.split(/\s+/)[0]);
      }
      try {
        await stat(candidatePath);
      } catch {
        findings.push({
          rule: 'L25',
          path: location.path,
          line: location.line,
          text: `missing referenced path ${candidate}`,
        });
      }
    }
  }
  return findings;
}

const { root, includeDocs } = parseArguments(process.argv.slice(2));
const findings = [];
findings.push(
  ...(await scanTextFiles(root, (path) => isSourceFile(path) || isTestFile(path), 'L22')),
);

for await (const path of filesUnder(root)) {
  const relativeName = relativePath(root, path);
  if (isExcluded(relativeName) || !isIllegalTestPlacement(relativeName)) continue;
  findings.push({
    rule: 'L23',
    path: relativeName,
    line: 0,
    text: 'test file is outside the declared test roots',
  });
}

if (includeDocs) {
  const docs = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/architecture.md'];
  const existingDocs = [];
  for (const path of docs) {
    try {
      await stat(resolve(root, path));
      existingDocs.push(path);
    } catch {
      // A missing architecture map is reported by the task that creates it.
    }
  }
  findings.push(...(await scanTextFiles(root, (path) => existingDocs.includes(path), 'L22')));
  if (existingDocs.length > 0) findings.push(...(await checkReferences(root, existingDocs)));
}

findings.sort((left, right) => {
  if (left.path !== right.path) return left.path.localeCompare(right.path);
  return left.line - right.line;
});

for (const finding of findings) {
  const location = finding.line > 0 ? `${finding.path}:${finding.line}` : finding.path;
  console.log(`repo-rules ${finding.rule} ${location}: ${finding.text}`);
}
if (findings.length > 0) {
  console.log(`repo-rules: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log(`repo-rules: ok${includeDocs ? ' (docs enabled)' : ''}`);
