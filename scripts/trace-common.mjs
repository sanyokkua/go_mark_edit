import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const storyDirectory = 'docs/stories';
const specificationDirectory = 'specification';
const sourceExtensions = new Set(['.go', '.js', '.jsx', '.ts', '.tsx']);
const skippedDirectories = new Set(['.git', 'build', 'dist', 'node_modules']);
const provingTagPattern = /^\s*\/\/\s*Proves:\s*(STORY-\d{3}-AC-\d+)\s*$/;
const jestAcceptanceCriterionPattern = /^\s*(?:it|test)\s*\(\s*['\"](STORY-\d{3}-AC-\d+)\b/;

function extension(path) {
  return path.slice(path.lastIndexOf('.'));
}

function slugifyHeading(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');
}

function parseFrontmatter(contents, filename) {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (match === null) {
    throw new Error(`${filename} has no YAML frontmatter.`);
  }

  const values = {};
  let currentList;
  for (const line of match[1].split(/\r?\n/)) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch !== null && currentList !== undefined) {
      values[currentList].push(listMatch[1].trim());
      continue;
    }

    const fieldMatch = line.match(/^([a-z_]+):(?:\s*(.*))?$/);
    if (fieldMatch === null) {
      continue;
    }

    const [, key, value] = fieldMatch;
    currentList = key;
    const normalizedValue = value?.trim() ?? '';
    values[key] = normalizedValue === '' || normalizedValue === '[]' ? [] : normalizedValue;
  }

  return values;
}

async function walk(root, predicate, files = []) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        await walk(entryPath, predicate, files);
      }
    } else if (predicate(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function readStories(root) {
  const files = await walk(resolve(root, storyDirectory), (name) => name.endsWith('.md'));
  const stories = [];
  for (const filename of files.sort()) {
    const contents = await readFile(filename, 'utf8');
    if (!contents.startsWith('---')) {
      continue;
    }
    const data = parseFrontmatter(contents, filename);
    if (data.id === undefined || !/^STORY-\d{3}$/.test(data.id)) {
      continue;
    }
    stories.push({ ...data, filename: relative(root, filename) });
  }
  return stories.sort((left, right) => left.id.localeCompare(right.id));
}

export async function collectProvingTests(root) {
  const files = await walk(resolve(root), (name) => {
    if (!sourceExtensions.has(extension(name))) {
      return false;
    }
    return name.endsWith('_test.go') || /\.test\.[jt]sx?$/.test(name);
  });
  const provingTests = new Map();
  for (const filename of files.sort()) {
    const contents = await readFile(filename, 'utf8');
    for (const [lineIndex, line] of contents.split(/\r?\n/).entries()) {
      const acceptanceCriterion = provingTagPattern.exec(line)?.[1] ?? jestAcceptanceCriterionPattern.exec(line)?.[1];
      if (acceptanceCriterion === undefined) {
        continue;
      }
      const location = `${relative(root, filename)}:${lineIndex + 1}`;
      const tests = provingTests.get(acceptanceCriterion) ?? [];
      tests.push(location);
      provingTests.set(acceptanceCriterion, tests);
    }
  }

  for (const tests of provingTests.values()) {
    tests.sort();
  }
  return provingTests;
}

export async function buildTraceRecord(root) {
  const stories = await readStories(root);
  const provingTests = await collectProvingTests(root);
  const record = {
    generated_at: new Date().toISOString(),
    generator_version: 1,
    stories: {},
    clauses: {},
    edge_cases: {},
    modules: {},
  };

  for (const story of stories) {
    const acceptanceCriteria = {};
    for (const acceptanceCriterion of story.acceptance_criteria) {
      acceptanceCriteria[acceptanceCriterion] = {
        tests: provingTests.get(acceptanceCriterion) ?? [],
      };
    }
    record.stories[story.id] = {
      title: story.title,
      status: story.status,
      phase: story.phase,
      spec_clauses: story.spec_clauses,
      modules: story.modules,
      edge_cases: story.edge_cases,
      acceptance_criteria: acceptanceCriteria,
    };

    for (const clause of story.spec_clauses) {
      const entry = record.clauses[clause] ?? { stories: [] };
      entry.stories.push(story.id);
      record.clauses[clause] = entry;
    }
    for (const edgeCase of story.edge_cases) {
      const entry = record.edge_cases[edgeCase] ?? { stories: [], tests: [] };
      entry.stories.push(story.id);
      for (const acceptanceCriterion of story.acceptance_criteria) {
        entry.tests.push(...(provingTests.get(acceptanceCriterion) ?? []));
      }
      entry.tests.sort();
      record.edge_cases[edgeCase] = entry;
    }
    for (const module of story.modules) {
      const entry = record.modules[module] ?? { stories: [] };
      entry.stories.push(story.id);
      record.modules[module] = entry;
    }
  }

  return { record, stories, provingTests };
}

export function renderTraceRecord(record) {
  return [
    '# traceability.yaml — GENERATED. Do not edit by hand. Regenerate with `just trace`.',
    '# Schema: specification/06_Process_and_Traceability/03_TRACEABILITY.md',
    JSON.stringify(record, null, 2),
    '',
  ].join('\n');
}

export async function validateTraceInputs(root, stories, provingTests) {
  const inventory = await readFile(
    resolve(root, specificationDirectory, '06_Process_and_Traceability/01_MODULE_INVENTORY.md'),
    'utf8',
  );
  const storyIds = new Set(stories.map((story) => story.id));
  const validationErrors = [];

  for (const story of stories) {
    for (const clause of story.spec_clauses) {
      const [relativePath, anchor] = clause.split('#');
      const specificationPath = resolve(root, specificationDirectory, relativePath);
      try {
        const specification = await readFile(specificationPath, 'utf8');
        const anchors = specification
          .split(/\r?\n/)
          .filter((line) => /^#{1,6}\s+/.test(line))
          .map((line) => slugifyHeading(line.replace(/^#{1,6}\s+/, '')));
        if (anchor === undefined || !anchors.includes(anchor)) {
          validationErrors.push(`${story.id}: unresolved clause ${clause}`);
        }
      } catch {
        validationErrors.push(`${story.id}: missing clause file ${relativePath}`);
      }
    }

    for (const module of story.modules) {
      if (!inventory.includes(`\`${module}\``)) {
        validationErrors.push(`${story.id}: module is absent from inventory: ${module}`);
      }
    }

    if (story.spec_clauses.length === 0) {
      validationErrors.push(`${story.id}: story has no spec clauses`);
    }
    if (story.status === 'done') {
      for (const acceptanceCriterion of story.acceptance_criteria) {
        if ((provingTests.get(acceptanceCriterion) ?? []).length === 0) {
          validationErrors.push(`${story.id}: ${acceptanceCriterion} has no proving test`);
        }
      }
    }
  }

  for (const acceptanceCriterion of provingTests.keys()) {
    const storyId = acceptanceCriterion.slice(0, 'STORY-000'.length);
    if (!storyIds.has(storyId)) {
      validationErrors.push(`orphan proving test for ${acceptanceCriterion}`);
    }
  }

  const dependencies = new Map(stories.map((story) => [story.id, story.depends_on]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (storyId) => {
    if (visiting.has(storyId)) {
      validationErrors.push(`cyclic story dependency involving ${storyId}`);
      return;
    }
    if (visited.has(storyId)) {
      return;
    }
    visiting.add(storyId);
    for (const dependency of dependencies.get(storyId) ?? []) {
      if (!dependencies.has(dependency)) {
        validationErrors.push(`${storyId}: missing dependency ${dependency}`);
      } else {
        visit(dependency);
      }
    }
    visiting.delete(storyId);
    visited.add(storyId);
  };
  for (const story of stories) {
    visit(story.id);
  }

  return validationErrors;
}

export function normalizeGeneratedAt(record) {
  const { generated_at: _generatedAt, ...stableRecord } = record;
  return stableRecord;
}

export function resolveTraceRoot(arguments_, defaultRoot) {
  if (arguments_.length === 0) {
    return defaultRoot;
  }
  if (arguments_.length === 2 && arguments_[0] === '--root') {
    return resolve(arguments_[1]);
  }
  throw new Error('usage: node scripts/trace.mjs [--root <repository-root>]');
}
