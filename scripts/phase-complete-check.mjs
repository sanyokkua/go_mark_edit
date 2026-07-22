#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { resolve } from 'node:path';

import {
  parseAndValidatePhases,
  resolvePhaseCLIArguments,
} from './phase-common.mjs';
import { readAndValidatePhase01Resolution } from './phase-resolution.mjs';
import {
  buildTraceRecord,
  validateTraceInputs,
} from './trace-common.mjs';

const { root, phase: phaseNumber } = resolvePhaseCLIArguments(
  process.argv.slice(2),
  process.cwd(),
  true,
);
const { phases, errors } = await parseAndValidatePhases(root);
const phase = phases.find((candidate) => candidate.number === phaseNumber);
if (phase === undefined) {
  errors.push(`phase ${phaseNumber} does not exist`);
} else {
  const { record, stories, provingTests, edgeCaseTests } = await buildTraceRecord(root);
  errors.push(
    ...(await validateTraceInputs(root, stories, provingTests, edgeCaseTests)),
  );

  const resolvedConflicts = new Set();
  if (phaseNumber === '01') {
    const resolution = await readAndValidatePhase01Resolution(root);
    if (resolution.errors.length > 0) {
      for (const error of resolution.errors) {
        errors.push(`PH01 resolution: ${error}`);
      }
    } else {
      resolvedConflicts.add('PH01-X01');
    }
  }

  if (phase.conflicts.length > 0) {
    for (const conflict of phase.conflicts) {
      if (!resolvedConflicts.has(conflict.ID)) {
        errors.push(`${conflict.ID} is an unresolved specification conflict`);
      }
    }
  }

  const storiesByID = new Map(stories.map((story) => [story.id, story]));
  let justfile = '';
  try {
    justfile = await readFile(resolve(root, 'justfile'), 'utf8');
  } catch {}
  const completeRequirements = new Set();
  for (const requirement of phase.requirements) {
    const requirementTrace = record.phase_requirements[requirement.ID];
    const storyEntries = Object.entries(requirementTrace?.stories ?? {});
    if (storyEntries.length === 0) {
      errors.push(`${requirement.ID} has no story acceptance-criterion coverage`);
      continue;
    }

    const doneEntries = storyEntries.filter(
      ([storyID]) => storiesByID.get(storyID)?.status === 'done',
    );
    if (doneEntries.length === 0) {
      errors.push(
        `${requirement.ID} is owned only by incomplete stories: ${storyEntries
          .map(([storyID]) => `${storyID} (${storiesByID.get(storyID)?.status ?? 'missing'})`)
          .join(', ')}`,
      );
      continue;
    }

    let hasProvenCriterion = false;
    for (const [storyID, entry] of doneEntries) {
      for (const acceptanceCriterion of entry.acceptance_criteria) {
        if ((provingTests.get(acceptanceCriterion) ?? []).length === 0) {
          errors.push(`${storyID}: ${acceptanceCriterion} has no proving test`);
        } else {
          hasProvenCriterion = true;
        }
      }
    }
    if (!hasProvenCriterion) {
      errors.push(`${requirement.ID} has no proven done-story acceptance criterion`);
    } else {
      completeRequirements.add(requirement.ID);
    }
  }

  const requirementIDs = (value) => [...new Set(value.match(/PH\d{2}-R\d{2}/g) ?? [])];
  for (const [kind, rows] of [
    ['transition', phase.transitions],
    ['contract', phase.contracts],
  ]) {
    for (const row of rows) {
      const unresolved = requirementIDs(row.Requirements).filter(
        (requirementID) => !completeRequirements.has(requirementID),
      );
      if (unresolved.length > 0) {
        errors.push(`${row.ID} ${kind} lacks done-story AC/test evidence for ${unresolved.join(', ')}`);
      }
    }
  }

  for (const edgeCase of phase.edgeCases) {
    if (edgeCase.Role === 'primary' && (edgeCaseTests.get(edgeCase['Edge case']) ?? []).length === 0) {
      errors.push(`${edgeCase['Edge case']} has no exact primary-phase proving test`);
    }
  }

  for (const evidence of phase.evidence) {
    if (evidence.Blocking.toLowerCase() !== 'yes') {
      continue;
    }
    const unresolved = requirementIDs(evidence.Requirements).filter(
      (requirementID) => !completeRequirements.has(requirementID),
    );
    if (unresolved.length > 0) {
      errors.push(`${evidence.ID} exit evidence lacks done-story AC/test coverage for ${unresolved.join(', ')}`);
    }
    if (
      evidence.Tier === 'automated'
    ) {
      const proof = evidence['Proof / artifact'];
      const justCommands = [...proof.matchAll(/`just\s+([a-z0-9-]+)/g)];
      const directCommands = [...proof.matchAll(/`(?:go test|npm|node|wails|sqlc|govulncheck)\b[^`]*`/g)];
      const testReferences = [...proof.matchAll(/([A-Za-z0-9_./-]+(?:_test\.go|\.test\.[tj]sx?|\.spec\.[tj]s))::([^;|`]+)/g)];
      if (justCommands.length === 0 && directCommands.length === 0 && testReferences.length === 0) {
        errors.push(`${evidence.ID} automated evidence must name an exact command or test`);
      }
      for (const command of justCommands) {
        if (!new RegExp(`^${command[1]}(?:\\s+[^:]*)?:`, 'm').test(justfile)) {
          errors.push(`${evidence.ID} references missing just recipe ${command[1]}`);
        }
      }
      for (const reference of testReferences) {
        try {
          const testContents = await readFile(resolve(root, reference[1]), 'utf8');
          if (!testContents.includes(reference[2].trim())) {
            errors.push(`${evidence.ID} references missing test ${reference[1]}::${reference[2].trim()}`);
          }
        } catch {
          errors.push(`${evidence.ID} references missing test file ${reference[1]}`);
        }
      }
    }
    if (evidence.Tier === 'real-runtime' || evidence.Tier === 'human') {
      const artifact = evidence['Proof / artifact'].replaceAll('`', '').trim();
      const owner = evidence.Owner.trim();
      let artifactExists = artifact.startsWith('docs/phase-evidence/');
      let artifactContents = '';
      if (artifactExists) {
        try {
          artifactContents = await readFile(resolve(root, artifact), 'utf8');
        } catch {
          artifactExists = false;
        }
      }
      if (!artifactExists || owner === '' || owner === '—') {
        errors.push(
          `${evidence.ID} ${evidence.Tier === 'human' ? 'human' : 'real-runtime'} evidence requires an approval owner and existing artifact`,
        );
      } else if (
        !/^\*\*Status:\*\*\s+(?:verified|approved)$/m.test(artifactContents) ||
        !/^\*\*Owner:\*\*\s+\S.+$/m.test(artifactContents) ||
        !/^\*\*Revision:\*\*\s+\S.+$/m.test(artifactContents) ||
        !/^\*\*Date:\*\*\s+\d{4}-\d{2}-\d{2}$/m.test(artifactContents)
      ) {
        errors.push(`${evidence.ID} evidence artifact is not verified or approved with owner, revision, and date`);
      }
    }
  }
}

const uniqueErrors = [...new Set(errors)];
if (uniqueErrors.length > 0) {
  for (const error of uniqueErrors) {
    console.error(`phase-complete-check: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`phase-complete-check: phase ${phaseNumber} complete`);
}
