import { readdir, readFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';

export const mandatoryPhaseSections = [
  'Goal',
  'Phase metadata',
  'Scope',
  'Out of scope',
  'Requirement ledger',
  'State and transition model',
  'Cross-phase contracts',
  'Edge and failure cases',
  'Non-normative work packages',
  'Phase exit evidence',
  'Clarification revision',
];

const emptyCellValues = new Set(['', '-', '—', 'n/a', 'tbd', 'todo', 'pending']);

function slugifyHeading(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s/g, '-');
}

function sectionBody(contents, heading) {
  const lines = contents.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) {
    return undefined;
  }
  const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join('\n').trim();
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseTable(contents, heading, errors, filename) {
  const body = sectionBody(contents, heading);
  if (body === undefined) {
    return [];
  }
  const lines = body.split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  if (lines.length < 3) {
    errors.push(`${filename}: ${heading} must contain a header and at least one row`);
    return [];
  }
  const headers = splitTableRow(lines[0]);
  return lines.slice(2).map((line, rowIndex) => {
    const cells = splitTableRow(line);
    if (cells.length !== headers.length) {
      errors.push(`${filename}: ${heading} row ${rowIndex + 1} has ${cells.length} cells; want ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function isEmptyCell(value) {
  return emptyCellValues.has((value ?? '').trim().toLowerCase());
}

function validateRequiredCells(rows, columns, tableName, errors, filename) {
  for (const row of rows) {
    const rowID = row.ID || row['Edge case'] || `${tableName} row`;
    for (const column of columns) {
      if (isEmptyCell(row[column])) {
        errors.push(`${filename}: ${rowID} has an empty ${column} cell`);
      }
    }
  }
}

function idsIn(value, pattern) {
  return [...new Set((value?.match(pattern) ?? []).map((id) => id.trim()))];
}

function sourceClausesIn(value) {
  return value?.match(/[A-Za-z0-9_./-]+\.md#[a-z0-9][a-z0-9-]*/g) ?? [];
}

async function clauseResolves(root, clause) {
  const [path, anchor] = clause.split('#');
  try {
    const contents = await readFile(resolve(root, 'specification', path), 'utf8');
    const anchors = contents
      .split(/\r?\n/)
      .filter((line) => /^#{1,6}\s+/.test(line))
      .map((line) => slugifyHeading(line.replace(/^#{1,6}\s+/, '')));
    return anchors.includes(anchor);
  } catch {
    return false;
  }
}

export async function readPhaseDocuments(root) {
  const phaseDirectory = resolve(root, 'specification', '07_Phases');
  let entries;
  try {
    entries = await readdir(phaseDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const phases = [];
  for (const entry of entries) {
    const match = /^PHASE_(\d{2})_.+\.md$/.exec(entry.name);
    if (!entry.isFile() || match === null) {
      continue;
    }
    const filename = resolve(phaseDirectory, entry.name);
    phases.push({
      number: match[1],
      filename: relative(root, filename),
      contents: await readFile(filename, 'utf8'),
    });
  }
  return phases.sort((left, right) => left.number.localeCompare(right.number));
}

export async function parseAndValidatePhases(root) {
  const phases = await readPhaseDocuments(root);
  const errors = [];
  const parsedPhases = [];
  const knownRequirements = new Set();
  const knownWorkPackages = new Set();
  let moduleInventory;
  if (phases.length > 0) {
    try {
      const inventoryContents = await readFile(
        resolve(root, 'specification', '06_Process_and_Traceability', '01_MODULE_INVENTORY.md'),
        'utf8',
      );
      moduleInventory = new Set(
        [...inventoryContents.matchAll(/^\|\s*`([^`]+\/)`[^|]*\|/gm)].map((match) => match[1]),
      );
    } catch {
      errors.push('missing specification/06_Process_and_Traceability/01_MODULE_INVENTORY.md');
    }

    try {
      await readFile(resolve(root, 'specification', '07_Phases', '00_ROADMAP.md'), 'utf8');
    } catch {
      errors.push('missing specification/07_Phases/00_ROADMAP.md');
    }
    const present = new Set(phases.map((phase) => phase.number));
    const missing = Array.from({ length: 16 }, (_, index) => String(index).padStart(2, '0'))
      .filter((number) => !present.has(number))
      .map((number) => `PH${number}`);
    if (missing.length > 0) {
      errors.push(`missing phase documents: ${missing.join(', ')}`);
    }
  }

  for (const phase of phases) {
    const prefix = `PH${phase.number}`;
    const orderedSections = sectionBody(phase.contents, 'Open specification conflicts') === undefined
      ? mandatoryPhaseSections
      : [
          ...mandatoryPhaseSections.slice(0, -1),
          'Open specification conflicts',
          mandatoryPhaseSections.at(-1),
        ];
    const sectionPositions = orderedSections.map((section) => ({
      section,
      position: phase.contents.indexOf(`## ${section}`),
    }));
    const presentPositions = sectionPositions.filter(({ position }) => position >= 0);
    if (presentPositions.some(({ position }, index) => index > 0 && position < presentPositions[index - 1].position)) {
      errors.push(`${phase.filename}: mandatory sections are out of order`);
    }
    for (const section of mandatoryPhaseSections) {
      if (sectionBody(phase.contents, section) === undefined) {
        errors.push(`${phase.filename}: missing section ${section}`);
      }
    }
    if (!/^\*\*Last Updated:\*\*\s+\d{4}-\d{2}-\d{2}$/m.test(phase.contents)) {
      errors.push(`${phase.filename}: missing ISO Last Updated metadata`);
    }

    const metadata = parseTable(phase.contents, 'Phase metadata', errors, phase.filename);
    const requirements = parseTable(phase.contents, 'Requirement ledger', errors, phase.filename);
    const transitions = parseTable(phase.contents, 'State and transition model', errors, phase.filename);
    const contracts = parseTable(phase.contents, 'Cross-phase contracts', errors, phase.filename);
    const edgeCases = parseTable(phase.contents, 'Edge and failure cases', errors, phase.filename);
    const workPackages = parseTable(phase.contents, 'Non-normative work packages', errors, phase.filename);
    const evidence = parseTable(phase.contents, 'Phase exit evidence', errors, phase.filename);
    const conflicts = sectionBody(phase.contents, 'Open specification conflicts') === undefined
      ? []
      : parseTable(phase.contents, 'Open specification conflicts', errors, phase.filename);

    validateRequiredCells(
      metadata,
      ['Phase', 'Kind', 'Stage / milestone', 'Depends on', 'Completion scope'],
      'Phase metadata',
      errors,
      phase.filename,
    );

    validateRequiredCells(
      requirements,
      ['ID', 'Required outcome', 'Source clauses', 'Constraints', 'Work package'],
      'Requirement ledger',
      errors,
      phase.filename,
    );
    validateRequiredCells(
      transitions,
      ['ID', 'Trigger', 'Preconditions', 'Ordered behavior', 'Result', 'Failure / preservation', 'Requirements'],
      'State and transition model',
      errors,
      phase.filename,
    );
    validateRequiredCells(
      contracts,
      ['ID', 'Producer', 'Consumer', 'Interface / invariant', 'Availability / lifetime', 'Ordering / concurrency', 'Source', 'Requirements'],
      'Cross-phase contracts',
      errors,
      phase.filename,
    );
    validateRequiredCells(
      edgeCases,
      ['Edge case', 'Role', 'Source clause', 'Requirements', 'Expected behavior', 'Evidence'],
      'Edge and failure cases',
      errors,
      phase.filename,
    );
    validateRequiredCells(
      workPackages,
      ['ID', 'Capability', 'Size', 'Modules', 'Artifacts', 'Requirements', 'Depends on'],
      'Non-normative work packages',
      errors,
      phase.filename,
    );
    validateRequiredCells(
      evidence,
      ['ID', 'Requirements', 'Tier', 'Proof / artifact', 'Platform / scope', 'Owner', 'Freshness', 'Blocking'],
      'Phase exit evidence',
      errors,
      phase.filename,
    );
    validateRequiredCells(
      conflicts,
      ['ID', 'Conflicting or missing sources', 'Required decision', 'Blocked requirements'],
      'Open specification conflicts',
      errors,
      phase.filename,
    );

    for (const row of metadata) {
      if (row.Phase !== prefix) {
        errors.push(`${phase.filename}: phase metadata id ${row.Phase} must equal ${prefix}`);
      }
      if (!['sequential', 'cross-cutting'].includes(row.Kind)) {
        errors.push(`${phase.filename}: phase kind must be sequential or cross-cutting`);
      }
      if (row['Depends on'] !== 'none' && !/^(?:PH\d{2})(?:[;, ]+PH\d{2})*$/.test(row['Depends on'])) {
        errors.push(`${phase.filename}: phase dependencies must use PHNN ids or none`);
      }
    }

    const phaseRequirements = new Set();
    for (const row of requirements) {
      if (!new RegExp(`^${prefix}-R\\d{2}$`).test(row.ID)) {
        errors.push(`${phase.filename}: malformed requirement id ${row.ID}`);
      }
      if (knownRequirements.has(row.ID)) {
        errors.push(`${phase.filename}: duplicate requirement ${row.ID}`);
      }
      knownRequirements.add(row.ID);
      phaseRequirements.add(row.ID);
      const clauses = sourceClausesIn(row['Source clauses']);
      if (clauses.length === 0) {
        errors.push(`${phase.filename}: ${row.ID} has no source clause`);
      }
      for (const clause of clauses) {
        if (!(await clauseResolves(root, clause))) {
          errors.push(`${phase.filename}: unresolved source clause ${clause}`);
        }
      }
    }

    const phaseWorkPackages = new Set();
    for (const row of workPackages) {
      if (!new RegExp(`^${prefix}-W\\d{2}$`).test(row.ID)) {
        errors.push(`${phase.filename}: malformed work-package id ${row.ID}`);
      }
      if (knownWorkPackages.has(row.ID)) {
        errors.push(`${phase.filename}: duplicate work package ${row.ID}`);
      }
      knownWorkPackages.add(row.ID);
      phaseWorkPackages.add(row.ID);
      if (/STORY-\d{3}/.test(Object.values(row).join(' '))) {
        errors.push(`${phase.filename}: work packages must not reserve global STORY ids`);
      }
      const artifactInModules = row.Modules.match(/(?:\.github\/|build\/|scripts\/|docs\/phase-evidence\/|specification\/|wails\.json|main\.go)/)?.[0];
      if (artifactInModules !== undefined) {
        errors.push(`${phase.filename}: ${row.ID} artifact path ${artifactInModules} appears in Modules; move it to Artifacts`);
      }
      if (moduleInventory !== undefined && row.Modules.trim().toLowerCase() !== 'none') {
        const declaredModules = row.Modules
          .split(/[;,]/)
          .map((value) => value.trim().replaceAll('`', ''))
          .filter((value) => value !== '');
        for (const modulePath of declaredModules) {
          if (!moduleInventory.has(modulePath)) {
            errors.push(`${phase.filename}: ${row.ID} module ${modulePath} is absent from the module inventory`);
          }
        }
      }
    }

    for (const row of requirements) {
      for (const workPackage of idsIn(row['Work package'], /PH\d{2}-W\d{1,2}/g)) {
        if (!phaseWorkPackages.has(workPackage)) {
          errors.push(`${phase.filename}: ${row.ID} references missing work package ${workPackage}`);
        }
      }
    }

    const evidenceRequirements = new Set(
      evidence
        .filter((row) => row.Blocking.toLowerCase() === 'yes')
        .flatMap((row) => idsIn(row.Requirements, /PH\d{2}-R\d{2}/g)),
    );
    for (const requirement of phaseRequirements) {
      if (!evidenceRequirements.has(requirement)) {
        errors.push(`${phase.filename}: ${requirement} has no exit evidence`);
      }
    }

    for (const [tableName, rows] of [
      ['transition', transitions],
      ['contract', contracts],
      ['edge case', edgeCases],
      ['work package', workPackages],
      ['exit evidence', evidence],
    ]) {
      for (const row of rows) {
        const referencedRequirements = idsIn(row.Requirements, /PH\d{2}-R\d{2}/g);
        if (referencedRequirements.length === 0) {
          errors.push(`${phase.filename}: ${row.ID || row['Edge case']} Requirements must name at least one PHNN-RNN id`);
        }
        for (const requirement of referencedRequirements) {
          if (!phaseRequirements.has(requirement)) {
            errors.push(`${phase.filename}: ${tableName} references unknown requirement ${requirement}`);
          }
        }
      }
    }

    for (const row of transitions) {
      if (!new RegExp(`^${prefix}-T\\d{2}$`).test(row.ID)) {
        errors.push(`${phase.filename}: malformed transition id ${row.ID}`);
      }
    }
    for (const row of contracts) {
      if (!new RegExp(`^${prefix}-C\\d{2}$`).test(row.ID)) {
        errors.push(`${phase.filename}: malformed contract id ${row.ID}`);
      }
      for (const clause of sourceClausesIn(row.Source)) {
        if (!(await clauseResolves(root, clause))) {
          errors.push(`${phase.filename}: unresolved source clause ${clause}`);
        }
      }
    }
    for (const row of evidence) {
      if (!new RegExp(`^${prefix}-E\\d{2}$`).test(row.ID)) {
        errors.push(`${phase.filename}: malformed exit-evidence id ${row.ID}`);
      }
      if (!['automated', 'real-runtime', 'human'].includes(row.Tier)) {
        errors.push(`${phase.filename}: ${row.ID} has invalid evidence tier ${row.Tier}`);
      }
      if (!['yes', 'no'].includes(row.Blocking.toLowerCase())) {
        errors.push(`${phase.filename}: ${row.ID} Blocking must be yes or no`);
      }
    }
    for (const row of edgeCases) {
      if (!/^EC-[A-Z0-9]+-\d+$/.test(row['Edge case'])) {
        errors.push(`${phase.filename}: malformed edge-case id ${row['Edge case']}`);
      } else if (!row.Evidence.includes(row['Edge case'])) {
        errors.push(`${phase.filename}: ${row['Edge case']} evidence must name the edge-case id exactly`);
      }
      if (!['primary', 'precursor', 'regression'].includes(row.Role)) {
        errors.push(`${phase.filename}: ${row['Edge case']} has invalid role ${row.Role}`);
      }
      for (const clause of sourceClausesIn(row['Source clause'])) {
        if (!(await clauseResolves(root, clause))) {
          errors.push(`${phase.filename}: unresolved source clause ${clause}`);
        }
      }
    }

    const idsByKind = [
      ['transition', transitions],
      ['contract', contracts],
      ['exit evidence', evidence],
      ['specification conflict', conflicts],
    ];
    for (const [kind, rows] of idsByKind) {
      const seen = new Set();
      for (const row of rows) {
        if (seen.has(row.ID)) {
          errors.push(`${phase.filename}: duplicate ${kind} ${row.ID}`);
        }
        seen.add(row.ID);
      }
    }
    for (const row of conflicts) {
      if (!new RegExp(`^${prefix}-X\\d{2}$`).test(row.ID)) {
        errors.push(`${phase.filename}: malformed specification-conflict id ${row.ID}`);
      }
      for (const requirement of idsIn(row['Blocked requirements'], /PH\d{2}-R\d{2}/g)) {
        if (!phaseRequirements.has(requirement)) {
          errors.push(`${phase.filename}: specification conflict references unknown requirement ${requirement}`);
        }
      }
    }

    parsedPhases.push({ ...phase, metadata, requirements, transitions, contracts, edgeCases, workPackages, evidence, conflicts });
  }

  const primaryOwners = new Map();
  const observedEdgeCases = new Set();
  for (const phase of parsedPhases) {
    for (const edgeCase of phase.edgeCases) {
      const edgeCaseID = edgeCase['Edge case'];
      if (!/^EC-[A-Z0-9]+-\d+$/.test(edgeCaseID)) {
        continue;
      }
      observedEdgeCases.add(edgeCaseID);
      if (edgeCase.Role === 'primary') {
        const owners = primaryOwners.get(edgeCaseID) ?? [];
        owners.push(`PH${phase.number}`);
        primaryOwners.set(edgeCaseID, owners);
      }
    }
  }
  for (const edgeCaseID of observedEdgeCases) {
    const owners = primaryOwners.get(edgeCaseID) ?? [];
    if (owners.length === 0) {
      errors.push(`${edgeCaseID} has no primary phase owner`);
    } else if (owners.length > 1) {
      errors.push(`${edgeCaseID} has ${owners.length} primary phase owners: ${owners.join(', ')}`);
    }
  }

  const phaseIDs = new Set(parsedPhases.map((phase) => `PH${phase.number}`));
  const dependencies = new Map();
  for (const phase of parsedPhases) {
    const phaseID = `PH${phase.number}`;
    const declared = phase.metadata[0]?.['Depends on'] ?? 'none';
    const phaseDependencies = declared === 'none' ? [] : idsIn(declared, /PH\d{2}/g);
    dependencies.set(phaseID, phaseDependencies);
    for (const dependency of phaseDependencies) {
      if (!phaseIDs.has(dependency)) {
        errors.push(`${phase.filename}: unknown phase dependency ${dependency}`);
      }
    }
  }

  const visited = new Set();
  const active = new Set();
  const stack = [];
  const reportedCycles = new Set();
  function visitPhase(phaseID) {
    if (active.has(phaseID)) {
      const cycleStart = stack.indexOf(phaseID);
      const cycle = [...stack.slice(cycleStart), phaseID];
      const label = cycle.join(' -> ');
      if (!reportedCycles.has(label)) {
        errors.push(`phase dependency cycle: ${label}`);
        reportedCycles.add(label);
      }
      return;
    }
    if (visited.has(phaseID)) {
      return;
    }
    active.add(phaseID);
    stack.push(phaseID);
    for (const dependency of dependencies.get(phaseID) ?? []) {
      if (phaseIDs.has(dependency)) {
        visitPhase(dependency);
      }
    }
    stack.pop();
    active.delete(phaseID);
    visited.add(phaseID);
  }
  for (const phaseID of [...phaseIDs].sort()) {
    visitPhase(phaseID);
  }

  return { phases: parsedPhases, errors };
}

export function resolvePhaseCLIArguments(arguments_, defaultRoot, requirePhase = false) {
  let root = defaultRoot;
  const remaining = [...arguments_];
  if (remaining[0] === '--root') {
    if (remaining.length < 2) {
      throw new Error('missing repository root after --root');
    }
    root = resolve(remaining[1]);
    remaining.splice(0, 2);
  }
  if (!requirePhase && remaining.length > 0) {
    throw new Error(`unexpected arguments: ${remaining.join(' ')}`);
  }
  if (requirePhase && (remaining.length !== 1 || !/^\d{2}$/.test(remaining[0]))) {
    throw new Error('phase-complete-check requires a two-digit phase number');
  }
  return { root, phase: remaining[0] };
}

export function phaseLabel(phase) {
  return `${phase.number} (${basename(phase.filename)})`;
}
