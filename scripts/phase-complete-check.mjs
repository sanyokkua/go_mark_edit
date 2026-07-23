#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
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

const execFileAsync = promisify(execFile);
const phase01CoverageDigest = '088b6c6e1c1393c615cfec85270493b893cacda67d24f7946b92f3ce4ce2b0e1';

async function currentRevision(root) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

function isAllowedEvidenceMetadataPath(path) {
  return path.startsWith('docs/phase-evidence/')
    || path === 'docs/stories/README.md'
    || path === 'docs/stories/story-032-produce-phase01-completion-evidence.md'
    || path === 'docs/traceability.yaml';
}

async function evidenceRevisionIsCurrentOrMetadataOnly(root, evidenceRevision) {
  const head = await currentRevision(root);
  if (head === undefined) return true;
  if (evidenceRevision === head) return true;
  if (!/^[a-f0-9]{40}$/i.test(evidenceRevision ?? '')) return false;
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', evidenceRevision, 'HEAD'], { cwd: root });
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--no-renames', `${evidenceRevision}..HEAD`], { cwd: root });
    return stdout.split('\n').filter(Boolean).every(isAllowedEvidenceMetadataPath);
  } catch {
    return false;
  }
}

function phaseEvidenceFrontmatter(contents) {
  return Object.fromEntries([...contents.matchAll(/^\*\*([^:]+):\*\*[ \t]+(.+)$/gm)].map((match) => [match[1].trim().toLowerCase(), match[2].trim()]));
}

async function validateE06CurrentHostRecord(root, artifact, errors) {
  let contents;
  try {
    contents = await readFile(resolve(root, artifact), 'utf8');
  } catch {
    return;
  }
  const fields = phaseEvidenceFrontmatter(contents);
  const revision = await currentRevision(root);
  const required = ['host', 'revision', 'freshness', 'procedure', 'result', 'limitations', 'deferred platforms', 'accepted adr', 'expires before'];
  for (const field of required) {
    if (!fields[field]) errors.push(`PH01-E06 current-host exception is missing ${field}`);
  }
  if (fields.host && fields.host !== process.platform) errors.push(`PH01-E06 current-host exception host must be ${process.platform}`);
  if (revision !== undefined && fields.revision && !(await evidenceRevisionIsCurrentOrMetadataOnly(root, fields.revision))) errors.push('PH01-E06 current-host exception revision is stale');
  if (fields.freshness && fields.freshness !== 'exact-revision') errors.push('PH01-E06 current-host exception freshness must be exact-revision');
  for (const field of ['procedure', 'result', 'limitations']) {
    if (fields[field] === undefined || fields[field].trim() === '') errors.push(`PH01-E06 current-host exception ${field} must be nonempty`);
  }
  if (fields['deferred platforms'] && fields['deferred platforms'] !== 'windows, linux') errors.push('PH01-E06 current-host exception deferred platforms must be windows, linux');
  if (fields['accepted adr'] && fields['accepted adr'] !== 'ADR-0016') errors.push('PH01-E06 current-host exception accepted ADR must be ADR-0016');
  if (fields['expires before'] && fields['expires before'] !== 'before-phase15-release-or-platform-claim') errors.push('PH01-E06 current-host exception expiry boundary is invalid');
  if (/\b(certif(?:y|ies|ied)|release|platform matrix|stage)\b/i.test(fields.limitations ?? '')) {
    errors.push('PH01-E06 current-host exception limitations make an overbroad claim');
  }
}

async function validateE07VisualApprovalRecord(root, artifact, errors) {
  let contents;
  try {
    contents = await readFile(resolve(root, artifact), 'utf8');
  } catch {
    return;
  }
  const fields = phaseEvidenceFrontmatter(contents);
  const revision = await currentRevision(root);
  for (const field of ['owner', 'revision', 'candidate screenshot', 'viewport crop', 'responsive results', 'approval']) {
    if (!fields[field]) errors.push(`PH01-E07 visual approval is missing ${field}`);
  }
  if (fields.status !== 'approved') errors.push('PH01-E07 visual approval must be explicitly approved');
  if (fields.owner && fields.owner !== 'product owner') errors.push('PH01-E07 visual approval owner must be product owner');
  if (revision !== undefined && fields.revision && !(await evidenceRevisionIsCurrentOrMetadataOnly(root, fields.revision))) errors.push('PH01-E07 visual approval revision is stale');
  if (fields['viewport crop'] && fields['viewport crop'] !== '1280x720') errors.push('PH01-E07 visual approval viewport crop must be 1280x720');
  if (fields['candidate screenshot']) {
    try {
      await readFile(resolve(root, fields['candidate screenshot']));
    } catch {
      errors.push('PH01-E07 visual approval candidate screenshot does not exist');
    }
  }
  if (fields.approval && !/^explicit approval by product owner for revision [0-9a-f]{40} and crop 1280x720$/i.test(fields.approval)) {
    errors.push('PH01-E07 visual approval must name the exact revision and 1280x720 crop');
  }
}

function resolveCompletionArguments(arguments_, cwd) {
  const checkpointIndex = arguments_.indexOf('--checkpoint');
  let checkpoint;
  let remaining = [...arguments_];
  if (checkpointIndex >= 0) {
    checkpoint = arguments_[checkpointIndex + 1];
    if (!['preview', 'editing'].includes(checkpoint) || checkpointIndex + 2 !== arguments_.length) {
      throw new Error('usage: phase-complete-check [--root path] 01 [--checkpoint preview|editing]');
    }
    remaining = arguments_.slice(0, checkpointIndex);
  }
  const parsed = resolvePhaseCLIArguments(remaining, cwd, true);
  if (checkpoint !== undefined && parsed.phase !== '01') {
    throw new Error('checkpoint validation is available only for Phase 01');
  }
  return { ...parsed, checkpoint };
}

function hasE08ManualCaptureExemption(resolution) {
  const policy = resolution?.exception_policies?.['PH01-E08'];
  return policy?.kind === 'manual-capture-exempt'
    && policy.accepted_adr === 'ADR-0018'
    && policy.exemption_scope === 'phase01-completion-gate-only';
}

const { root, phase: phaseNumber, checkpoint } = resolveCompletionArguments(process.argv.slice(2), process.cwd());
const { phases, errors } = await parseAndValidatePhases(root);
const phase = phases.find((candidate) => candidate.number === phaseNumber);
if (phase === undefined) {
  errors.push(`phase ${phaseNumber} does not exist`);
} else {
  const { record, stories, provingTests, edgeCaseTests, edgeCaseTestIdentities } = await buildTraceRecord(root);
  errors.push(
    ...(await validateTraceInputs(root, stories, provingTests, edgeCaseTests)),
  );

  const resolvedConflicts = new Set();
  let phase01Resolution;
  if (phaseNumber === '01') {
    phase01Resolution = await readAndValidatePhase01Resolution(root);
    if (phase01Resolution.errors.length > 0) {
      for (const error of phase01Resolution.errors) {
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

  if (checkpoint !== undefined && phase01Resolution?.resolution !== undefined) {
    const requirements = phase01Resolution.resolution.checkpoints[checkpoint].requirements;
    for (const requirement of requirements) {
      if (!completeRequirements.has(requirement)) {
        errors.push(`${checkpoint} checkpoint lacks proven done-story coverage for ${requirement}`);
      }
    }
    if (checkpoint === 'editing') {
      const previewRequirements = phase01Resolution.resolution.checkpoints.preview.requirements;
      const missingPreview = previewRequirements.filter((requirement) => !completeRequirements.has(requirement));
      if (missingPreview.length > 0) {
        errors.push(`editing checkpoint requires preview checkpoint; missing ${missingPreview.join(', ')}`);
      }
    }
  }

  if (phaseNumber === '01' && checkpoint === undefined && phase01Resolution?.resolution !== undefined) {
    const previewMissing = phase01Resolution.resolution.checkpoints.preview.requirements.filter(
      (requirement) => !completeRequirements.has(requirement),
    );
    if (previewMissing.length > 0) {
      errors.push(`full gate requires logical preview checkpoint evaluation before editing; missing ${previewMissing.join(', ')}`);
    } else {
      const editingMissing = phase01Resolution.resolution.checkpoints.editing.requirements.filter(
        (requirement) => !completeRequirements.has(requirement),
      );
      if (editingMissing.length > 0) errors.push(`full gate requires logical editing checkpoint evaluation after preview; missing ${editingMissing.join(', ')}`);
    }
  }

  if (phaseNumber === '01' && checkpoint === undefined && phase01Resolution?.resolution !== undefined) {
    const coverage = phase01Resolution.resolution.coverage;
    const e08ManualCaptureExempt = hasE08ManualCaptureExemption(phase01Resolution.resolution);
    if (createHash('sha256').update(JSON.stringify(coverage)).digest('hex') !== phase01CoverageDigest) {
      errors.push('PH01 coverage acceptance-criterion mapping differs from the decision-complete STORY-026 table');
    }
    const phaseRows = {
      transitions: new Map(phase.transitions.map((row) => [row.ID, row.Requirements])),
      contracts: new Map(phase.contracts.map((row) => [row.ID, row.Requirements])),
      edge_cases: new Map(phase.edgeCases.map((row) => [row['Edge case'], row.Requirements])),
      evidence: new Map(phase.evidence.map((row) => [row.ID, row.Requirements])),
    };
    for (const [kind, rows] of Object.entries(coverage)) {
      if (kind === 'version' || !phaseRows[kind]) continue;
      for (const [id, row] of Object.entries(rows)) {
        if (kind === 'evidence' && id === 'PH01-E08' && e08ManualCaptureExempt) {
          continue;
        }
        const required = new Set(requirementIDs(phaseRows[kind].get(id) ?? ''));
        const mapped = new Set(row.requirements ?? []);
        if (required.size !== mapped.size || [...required].some((requirement) => !mapped.has(requirement))) {
          errors.push(`${id} coverage requirements do not exactly match the phase row`);
        }
        const mappedRequirements = new Set();
        for (const acceptanceCriterion of row.acceptance_criteria ?? []) {
          const storyID = acceptanceCriterion.slice(0, 'STORY-000'.length);
          const story = storiesByID.get(storyID);
          if (story === undefined || !story.acceptance_criteria.includes(acceptanceCriterion)) {
            errors.push(`${id} references unknown acceptance criterion ${acceptanceCriterion}`);
            continue;
          }
          const satisfied = story.satisfies[acceptanceCriterion] ?? [];
          const owned = satisfied.filter((requirement) => required.has(requirement));
          if (owned.length === 0) {
            errors.push(`${id} maps unrelated acceptance criterion ${acceptanceCriterion}`);
          }
          for (const requirement of owned) mappedRequirements.add(requirement);
          if (story.status !== 'done' || (provingTests.get(acceptanceCriterion) ?? []).length === 0) {
            errors.push(`${id} acceptance criterion is not proven by a done story: ${acceptanceCriterion}`);
          }
        }
        if ([...required].some((requirement) => !mappedRequirements.has(requirement))) {
          errors.push(`${id} mapped acceptance criteria do not cover every row requirement`);
        }
        if (kind === 'edge_cases') {
          const collected = new Set(edgeCaseTestIdentities.get(id) ?? []);
          for (const identity of row.evidence_tests ?? []) {
            if (!collected.has(identity)) errors.push(`${id} references unresolved edge evidence ${identity}`);
          }
        }
      }
    }
    const e06Artifact = coverage.evidence?.['PH01-E06']?.artifacts?.[0];
    if (e06Artifact !== undefined) await validateE06CurrentHostRecord(root, e06Artifact, errors);
    const e07Artifact = coverage.evidence?.['PH01-E07']?.artifacts?.[0];
    if (e07Artifact !== undefined) await validateE07VisualApprovalRecord(root, e07Artifact, errors);
  }

  if (checkpoint === undefined) for (const [kind, rows] of [
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

  if (checkpoint === undefined) for (const edgeCase of phase.edgeCases) {
    if (edgeCase.Role === 'primary' && (edgeCaseTests.get(edgeCase['Edge case']) ?? []).length === 0) {
      errors.push(`${edgeCase['Edge case']} has no exact primary-phase proving test`);
    }
  }

  if (checkpoint === undefined) for (const evidence of phase.evidence) {
    const e08ManualCaptureExempt = phaseNumber === '01'
      && evidence.ID === 'PH01-E08'
      && hasE08ManualCaptureExemption(phase01Resolution?.resolution);
    if (e08ManualCaptureExempt) {
      continue;
    }
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
  console.log(checkpoint === undefined
    ? `phase-complete-check: phase ${phaseNumber} complete`
    : `phase-complete-check: Phase 01 ${checkpoint} implementation checkpoint complete`);
}
