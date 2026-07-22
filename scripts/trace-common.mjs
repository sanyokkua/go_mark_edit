import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { parseAndValidatePhases } from "./phase-common.mjs";

const storyDirectory = "docs/stories";
const specificationDirectory = "specification";
const sourceExtensions = new Set([".go", ".js", ".jsx", ".ts", ".tsx"]);
const skippedDirectories = new Set([".git", "build", "dist", "node_modules"]);
const provingTagPattern = /^\s*\/\/\s*Proves:\s*(STORY-\d{3}-AC-\d+)\s*$/;
const edgeCaseEvidencePattern = /^\s*\/\/\s*Evidence:\s*(.+)$/;
const jestAcceptanceCriterionPattern =
  /^\s*(?:it|test)\s*\(\s*['\"](STORY-\d{3}-AC-\d+)\b/;
const jestTestNamePattern = /^\s*(?:it|test)\s*\(\s*(['\"])(.*?)\1/;
const goTestDeclarationPattern = /^\s*func\s+Test\w+\s*\(/;
const jestTestDeclarationPattern = /^\s*(?:it|test)\s*\(/;
const edgeCasePattern = /\bEC-[A-Z0-9]+-\d+\b/g;

function extension(path) {
  return path.slice(path.lastIndexOf("."));
}

function slugifyHeading(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");
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
    const normalizedValue = value?.trim() ?? "";
    values[key] =
      normalizedValue === "" || normalizedValue === "[]" ? [] : normalizedValue;
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
  const files = await walk(resolve(root, storyDirectory), (name) =>
    name.endsWith(".md"),
  );
  const stories = [];
  for (const filename of files.sort()) {
    const contents = await readFile(filename, "utf8");
    if (!contents.startsWith("---")) {
      continue;
    }
    const data = parseFrontmatter(contents, filename);
    if (data.id === undefined || !/^STORY-\d{3}$/.test(data.id)) {
      continue;
    }
    stories.push({
      ...data,
      phase_requirements: data.phase_requirements ?? [],
      satisfies: parseAcceptanceMappings(contents, data.acceptance_criteria ?? []),
      filename: relative(root, filename),
    });
  }
  return stories.sort((left, right) => left.id.localeCompare(right.id));
}

function parseAcceptanceMappings(contents, acceptanceCriteria) {
  const mappings = Object.fromEntries(
    acceptanceCriteria.map((acceptanceCriterion) => [acceptanceCriterion, []]),
  );
  const headings = [...contents.matchAll(/^###\s+(STORY-\d{3}-AC-\d+)\s*$/gm)];
  for (const [index, heading] of headings.entries()) {
    if (!(heading[1] in mappings)) {
      continue;
    }
    const sectionStart = (heading.index ?? 0) + heading[0].length;
    const sectionEnd = headings[index + 1]?.index ?? contents.length;
    const section = contents.slice(sectionStart, sectionEnd).split(/^##\s+/m)[0];
    const satisfiesLine = section.match(/^\*\*Satisfies:\*\*\s*(.+)$/m)?.[1] ?? "";
    mappings[heading[1]] = [...new Set(satisfiesLine.match(/PH\d{2}-R\d{2}/g) ?? [])].sort();
  }
  return mappings;
}

export async function collectProvingTests(root) {
  const files = await walk(resolve(root), (name) => {
    if (!sourceExtensions.has(extension(name))) {
      return false;
    }
    return name.endsWith("_test.go") || /\.test\.[jt]sx?$/.test(name);
  });
  const provingTests = new Map();
  const edgeCaseTests = new Map();
  const edgeCaseTestIdentities = new Map();
  for (const filename of files.sort()) {
    const contents = await readFile(filename, "utf8");
    const lines = contents.split(/\r?\n/);
    const isGoTest = filename.endsWith("_test.go");
    const declarationPattern = isGoTest
      ? goTestDeclarationPattern
      : jestTestDeclarationPattern;
    const declarations = [];
    for (const [lineIndex, line] of lines.entries()) {
      if (declarationPattern.test(line)) {
        declarations.push({
          lineIndex,
          evidenceStart: leadingCommentStart(lines, lineIndex),
        });
      }
    }

    for (const declaration of declarations) {
      const leadingLines = lines.slice(
        declaration.evidenceStart,
        declaration.lineIndex,
      );
      const acceptanceCriteria = new Set();
      for (const line of leadingLines) {
        const acceptanceCriterion = provingTagPattern.exec(line)?.[1];
        if (acceptanceCriterion !== undefined) {
          acceptanceCriteria.add(acceptanceCriterion);
        }
      }
      if (!isGoTest) {
        const acceptanceCriterion = jestAcceptanceCriterionPattern.exec(
          lines[declaration.lineIndex],
        )?.[1];
        if (acceptanceCriterion !== undefined) {
          acceptanceCriteria.add(acceptanceCriterion);
        }
      }

      const location = `${relative(root, filename)}:${declaration.lineIndex + 1}`;
      const testName = isGoTest
        ? /func\s+(Test\w+)\s*\(/.exec(lines[declaration.lineIndex])?.[1] ?? ""
        : jestTestNamePattern.exec(lines[declaration.lineIndex])?.[2] ?? "";
      for (const acceptanceCriterion of acceptanceCriteria) {
        addEvidence(provingTests, acceptanceCriterion, location);
      }

      const explicitEdgeCases = new Set();
      for (const line of leadingLines) {
        const evidence = edgeCaseEvidencePattern.exec(line)?.[1];
        for (const edgeCase of evidence?.match(edgeCasePattern) ?? []) {
          explicitEdgeCases.add(edgeCase);
        }
      }
      if (!isGoTest) {
        const testName = jestTestNamePattern.exec(lines[declaration.lineIndex])?.[2] ?? "";
        for (const edgeCase of testName.match(edgeCasePattern) ?? []) {
          explicitEdgeCases.add(edgeCase);
        }
      }
      for (const edgeCase of explicitEdgeCases) {
        addEvidence(edgeCaseTests, edgeCase, location);
        addEvidence(edgeCaseTestIdentities, edgeCase, `${relative(root, filename)}::${testName}`);
      }
    }
  }

  for (const evidence of [provingTests, edgeCaseTests, edgeCaseTestIdentities]) {
    for (const tests of evidence.values()) {
      tests.sort();
    }
  }
  return { provingTests, edgeCaseTests, edgeCaseTestIdentities };
}

function leadingCommentStart(lines, declarationLine) {
  let start = declarationLine;
  while (start > 0 && /^\s*\/\//.test(lines[start - 1])) {
    start -= 1;
  }
  return start;
}

function addEvidence(evidence, identifier, location) {
  const tests = evidence.get(identifier) ?? [];
  if (!tests.includes(location)) {
    tests.push(location);
  }
  evidence.set(identifier, tests);
}

export async function buildTraceRecord(root) {
  const stories = await readStories(root);
  const { provingTests, edgeCaseTests, edgeCaseTestIdentities } = await collectProvingTests(root);
  const { phases } = await parseAndValidatePhases(root);
  const record = {
    generated_at: new Date().toISOString(),
    generator_version: 2,
    stories: {},
    phase_requirements: {},
    clauses: {},
    edge_cases: {},
    modules: {},
  };

  for (const phase of phases) {
    for (const requirement of phase.requirements) {
      record.phase_requirements[requirement.ID] = {
        phase: phase.number,
        source_clauses: requirement["Source clauses"].match(/[A-Za-z0-9_./-]+\.md#[a-z0-9][a-z0-9-]*/g) ?? [],
        stories: {},
        tests: [],
      };
    }
  }

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
      phase_requirements: story.phase_requirements,
      spec_clauses: story.spec_clauses,
      modules: story.modules,
      edge_cases: story.edge_cases,
      acceptance_criteria: acceptanceCriteria,
    };

    for (const acceptanceCriterion of story.acceptance_criteria) {
      for (const requirementID of story.satisfies[acceptanceCriterion] ?? []) {
        const requirement = record.phase_requirements[requirementID];
        if (requirement === undefined) {
          continue;
        }
        const storyEntry = requirement.stories[story.id] ?? { acceptance_criteria: [] };
        storyEntry.acceptance_criteria.push(acceptanceCriterion);
        storyEntry.acceptance_criteria.sort();
        requirement.stories[story.id] = storyEntry;
        requirement.tests = [
          ...new Set([
            ...requirement.tests,
            ...(provingTests.get(acceptanceCriterion) ?? []),
          ]),
        ].sort();
      }
    }

    for (const clause of story.spec_clauses) {
      const entry = record.clauses[clause] ?? { stories: [] };
      entry.stories.push(story.id);
      record.clauses[clause] = entry;
    }
    for (const edgeCase of story.edge_cases) {
      const entry = record.edge_cases[edgeCase] ?? { stories: [], tests: [] };
      entry.stories.push(story.id);
      entry.tests = [
        ...new Set([
          ...(entry.tests ?? []),
          ...(edgeCaseTests.get(edgeCase) ?? []),
        ]),
      ].sort();
      record.edge_cases[edgeCase] = entry;
    }
    for (const module of story.modules) {
      const entry = record.modules[module] ?? { stories: [] };
      entry.stories.push(story.id);
      record.modules[module] = entry;
    }
  }

  return { record, stories, provingTests, edgeCaseTests, edgeCaseTestIdentities };
}

export function renderTraceRecord(record) {
  return [
    "# traceability.yaml — GENERATED. Do not edit by hand. Regenerate with `just trace`.",
    "# Schema: specification/06_Process_and_Traceability/03_TRACEABILITY.md",
    JSON.stringify(record, null, 2),
    "",
  ].join("\n");
}

export async function validateTraceInputs(
  root,
  stories,
  provingTests,
  edgeCaseTests,
) {
  const inventory = await readFile(
    resolve(
      root,
      specificationDirectory,
      "06_Process_and_Traceability/01_MODULE_INVENTORY.md",
    ),
    "utf8",
  );
  const storyIds = new Set(stories.map((story) => story.id));
  const storiesByID = new Map(stories.map((story) => [story.id, story]));
  const validationErrors = [];
  const { phases, errors: phaseErrors } = await parseAndValidatePhases(root);
  const requirementsByID = new Map(
    phases.flatMap((phase) => phase.requirements.map((requirement) => [requirement.ID, { phase: phase.number, requirement }])),
  );

  validationErrors.push(...phaseErrors);

  await validateStoryStatusBoard(root, storiesByID, validationErrors);

  for (const story of stories) {
    if ((story.status === "ready" || story.status === "in-progress") && story.estimate === "L") {
      validationErrors.push(`${story.id}: L story cannot be ${story.status}; split it into S/M stories`);
    }
    if (phases.length > 0) {
      const frontmatterRequirements = [...new Set(story.phase_requirements)].sort();
      const satisfiesRequirements = [
        ...new Set(Object.values(story.satisfies).flat()),
      ].sort();
      for (const acceptanceCriterion of story.acceptance_criteria) {
        if ((story.satisfies[acceptanceCriterion] ?? []).length === 0) {
          validationErrors.push(`${story.id}: ${acceptanceCriterion} has no Satisfies mapping`);
        }
      }
      for (const requirementID of frontmatterRequirements) {
        const requirement = requirementsByID.get(requirementID);
        if (requirement === undefined) {
          validationErrors.push(`${story.id}: undefined phase requirement ${requirementID}`);
        } else if (requirement.phase !== story.phase) {
          validationErrors.push(`${story.id}: ${requirementID} belongs to phase ${requirement.phase}, not ${story.phase}`);
        }
      }
      if (JSON.stringify(frontmatterRequirements) !== JSON.stringify(satisfiesRequirements)) {
        validationErrors.push(
          `${story.id}: phase_requirements disagree with AC Satisfies union (frontmatter: ${frontmatterRequirements.join(", ") || "none"}; ACs: ${satisfiesRequirements.join(", ") || "none"})`,
        );
      }
    }
    for (const clause of story.spec_clauses) {
      const [relativePath, anchor] = clause.split("#");
      const specificationPath = resolve(
        root,
        specificationDirectory,
        relativePath,
      );
      try {
        const specification = await readFile(specificationPath, "utf8");
        const anchors = specification
          .split(/\r?\n/)
          .filter((line) => /^#{1,6}\s+/.test(line))
          .map((line) => slugifyHeading(line.replace(/^#{1,6}\s+/, "")));
        if (anchor === undefined || !anchors.includes(anchor)) {
          validationErrors.push(`${story.id}: unresolved clause ${clause}`);
        }
      } catch {
        validationErrors.push(
          `${story.id}: missing clause file ${relativePath}`,
        );
      }
    }

    for (const module of story.modules) {
      if (!inventory.includes(`\`${module}\``)) {
        validationErrors.push(
          `${story.id}: module is absent from inventory: ${module}`,
        );
      }
    }

    if (story.spec_clauses.length === 0) {
      validationErrors.push(`${story.id}: story has no spec clauses`);
    }
    if (story.status === "done") {
      for (const acceptanceCriterion of story.acceptance_criteria) {
        if ((provingTests.get(acceptanceCriterion) ?? []).length === 0) {
          validationErrors.push(
            `${story.id}: ${acceptanceCriterion} has no proving test`,
          );
        }
      }
      for (const edgeCase of story.edge_cases) {
        if ((edgeCaseTests.get(edgeCase) ?? []).length === 0) {
          validationErrors.push(
            `${story.id}: ${edgeCase} has no exact proving test`,
          );
        }
      }
    }

    if (story.status === "ready") {
      for (const dependency of story.depends_on) {
        const dependencyStory = storiesByID.get(dependency);
        if (
          dependencyStory !== undefined &&
          dependencyStory.status !== "done"
        ) {
          validationErrors.push(
            `${story.id}: dependency ${dependency} is not done (status: ${dependencyStory.status})`,
          );
        }
      }
    }
  }

  for (const acceptanceCriterion of provingTests.keys()) {
    const storyId = acceptanceCriterion.slice(0, "STORY-000".length);
    if (!storyIds.has(storyId)) {
      validationErrors.push(`orphan proving test for ${acceptanceCriterion}`);
    }
  }

  const dependencies = new Map(
    stories.map((story) => [story.id, story.depends_on]),
  );
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

async function validateStoryStatusBoard(root, storiesByID, validationErrors) {
  const boardPath = resolve(root, storyDirectory, "README.md");
  let board;
  try {
    board = await readFile(boardPath, "utf8");
  } catch {
    validationErrors.push("docs/stories/README.md status board is missing");
    return;
  }

  const boardStatuses = new Map();
  for (const line of board.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*(STORY-\d{3})\s*\|[^|]*\|[^|]*\|\s*([a-z-]+)\s*\|/,
    );
    if (match === null) {
      continue;
    }
    const [, storyID, status] = match;
    if (boardStatuses.has(storyID)) {
      validationErrors.push(`${storyID}: duplicate status board row`);
    }
    boardStatuses.set(storyID, status);
  }

  for (const [storyID, story] of storiesByID) {
    const boardStatus = boardStatuses.get(storyID);
    if (boardStatus === undefined) {
      validationErrors.push(
        `${storyID}: missing from status board (front matter: ${story.status})`,
      );
    } else if (boardStatus !== story.status) {
      validationErrors.push(
        `${storyID}: front matter status ${story.status} disagrees with status board status ${boardStatus}`,
      );
    }
  }
  for (const storyID of boardStatuses.keys()) {
    if (!storiesByID.has(storyID)) {
      validationErrors.push(
        `${storyID}: status board row has no story front matter`,
      );
    }
  }
}

export function normalizeGeneratedAt(record) {
  const { generated_at: _generatedAt, ...stableRecord } = record;
  return stableRecord;
}

export function resolveTraceRoot(arguments_, defaultRoot) {
  if (arguments_.length === 0) {
    return defaultRoot;
  }
  if (arguments_.length === 2 && arguments_[0] === "--root") {
    return resolve(arguments_[1]);
  }
  throw new Error("usage: node scripts/trace.mjs [--root <repository-root>]");
}
