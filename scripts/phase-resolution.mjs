#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const previewRequirements = [
  'PH01-R01',
  'PH01-R02',
  'PH01-R05',
  'PH01-R08',
  'PH01-R11',
  'PH01-R12',
  'PH01-R13',
  'PH01-R14',
  'PH01-R16',
];
const editingRequirements = [
  'PH01-R03',
  'PH01-R04',
  'PH01-R06',
  'PH01-R07',
  'PH01-R09',
  'PH01-R10',
];

const requiredIDs = {
  transitions: ['PH01-T01', 'PH01-T02', 'PH01-T03', 'PH01-T04', 'PH01-T05', 'PH01-T06', 'PH01-T07'],
  contracts: ['PH01-C01', 'PH01-C02', 'PH01-C03', 'PH01-C04', 'PH01-C05', 'PH01-C06'],
  edge_cases: ['EC-DOCS-12', 'EC-RENDER-4', 'EC-RENDER-5', 'EC-RENDER-6', 'EC-RENDER-7', 'EC-I18N-1', 'EC-I18N-2'],
  evidence: ['PH01-E01', 'PH01-E02', 'PH01-E03', 'PH01-E04', 'PH01-E05', 'PH01-E06', 'PH01-E07', 'PH01-E08', 'PH01-E09', 'PH01-E10', 'PH01-E11'],
};

const e06RecordFields = [
  'host',
  'revision',
  'freshness',
  'procedure',
  'result',
  'limitations',
  'deferred_platforms',
  'accepted_adr',
  'expires_before',
];

function parseError(line, message) {
  return new Error(`line ${line}: ${message}`);
}

function nextMeaningfulLine(lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim() !== '') {
      return index;
    }
  }
  return undefined;
}

function indentation(line, lineNumber) {
  if (line.includes('\t')) {
    throw parseError(lineNumber, 'tabs are not supported');
  }
  const match = /^( *)/.exec(line);
  const spaces = match?.[1].length ?? 0;
  if (spaces % 2 !== 0) {
    throw parseError(lineNumber, 'indentation must use whole two-space levels');
  }
  return spaces;
}

function parseScalar(source, lineNumber) {
  if (source.startsWith('"')) {
    try {
      const value = JSON.parse(source);
      if (typeof value !== 'string') {
        throw new Error('not a string');
      }
      return value;
    } catch {
      throw parseError(lineNumber, 'invalid quoted scalar');
    }
  }
  if (source.startsWith("'")) {
    if (!source.endsWith("'")) {
      throw parseError(lineNumber, 'invalid quoted scalar');
    }
    let value = '';
    for (let index = 1; index < source.length - 1; index += 1) {
      if (source[index] === "'") {
        if (source[index + 1] !== "'") {
          throw parseError(lineNumber, 'invalid quoted scalar');
        }
        value += "'";
        index += 1;
      } else {
        value += source[index];
      }
    }
    return value;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(source)) {
    throw parseError(lineNumber, `unsupported scalar ${source}`);
  }
  return source;
}

function splitInlineList(source, lineNumber) {
  const values = [];
  let valueStart = 0;
  let quote;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (quote === '"' && character === '\\') {
        escaped = true;
      } else if (quote === "'" && character === "'" && source[index + 1] === "'") {
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ',') {
      values.push(source.slice(valueStart, index).trim());
      valueStart = index + 1;
    }
  }
  if (quote !== undefined || escaped) {
    throw parseError(lineNumber, 'unterminated quoted list item');
  }
  values.push(source.slice(valueStart).trim());
  if (values.some((value) => value === '')) {
    throw parseError(lineNumber, 'inline lists cannot contain empty items');
  }
  return values.map((value) => parseScalar(value, lineNumber));
}

function parseValue(source, lineNumber) {
  if (source === '{}') {
    return {};
  }
  if (source.startsWith('[') && source.endsWith(']')) {
    const contents = source.slice(1, -1).trim();
    return contents === '' ? [] : splitInlineList(contents, lineNumber);
  }
  return parseScalar(source, lineNumber);
}

/**
 * Parse the deliberately small YAML subset accepted by phase-resolution records.
 * It accepts only maps, quoted/bare scalars, inline scalar lists, and empty maps.
 */
export function parsePhaseResolutionYAML(contents) {
  const lines = contents.split(/\r?\n/);
  let cursor = 0;

  function parseMap(level) {
    const result = {};
    let entries = 0;
    while (cursor < lines.length) {
      if (lines[cursor].trim() === '') {
        cursor += 1;
        continue;
      }
      const lineNumber = cursor + 1;
      const currentLevel = indentation(lines[cursor], lineNumber);
      if (currentLevel < level) {
        break;
      }
      if (currentLevel > level) {
        throw parseError(lineNumber, 'unexpected indentation');
      }
      const entry = /^ {0,}([A-Za-z][A-Za-z0-9_-]*):(?: (.*))?$/.exec(lines[cursor]);
      if (entry === null) {
        throw parseError(lineNumber, 'expected a map entry');
      }
      const [, key, rawValue] = entry;
      if (Object.hasOwn(result, key)) {
        throw parseError(lineNumber, `duplicate key ${key}`);
      }
      cursor += 1;
      if (rawValue === undefined || rawValue === '') {
        const childIndex = nextMeaningfulLine(lines, cursor);
        if (childIndex === undefined) {
          throw parseError(lineNumber, `missing value for ${key}`);
        }
        const childLevel = indentation(lines[childIndex], childIndex + 1);
        if (childLevel !== level + 2) {
          throw parseError(childIndex + 1, `nested map for ${key} must be indented by two spaces`);
        }
        result[key] = parseMap(level + 2);
      } else {
        result[key] = parseValue(rawValue, lineNumber);
      }
      entries += 1;
    }
    if (entries === 0) {
      throw parseError(cursor + 1, 'maps cannot be empty; use {}');
    }
    return result;
  }

  const first = nextMeaningfulLine(lines, 0);
  if (first === undefined) {
    throw new Error('resolution is empty');
  }
  if (indentation(lines[first], first + 1) !== 0) {
    throw parseError(first + 1, 'top-level keys cannot be indented');
  }
  cursor = first;
  const result = parseMap(0);
  const trailing = nextMeaningfulLine(lines, cursor);
  if (trailing !== undefined) {
    throw parseError(trailing + 1, 'unexpected trailing content');
  }
  return result;
}

function isMap(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectMap(value, path, errors) {
  if (!isMap(value)) {
    errors.push(`${path} must be a map`);
    return false;
  }
  return true;
}

function expectExactKeys(value, expected, path, errors) {
  if (!expectMap(value, path, errors)) {
    return;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const unknown = actual.filter((key) => !wanted.includes(key));
  const missing = wanted.filter((key) => !actual.includes(key));
  if (unknown.length > 0) {
    errors.push(`${path} has unsupported keys: ${unknown.join(', ')}`);
  }
  if (missing.length > 0) {
    errors.push(`${path} is missing keys: ${missing.join(', ')}`);
  }
}

function expectScalar(value, expected, path, errors) {
  if (value !== expected) {
    errors.push(`${path} must be ${JSON.stringify(expected)}`);
  }
}

function expectExactList(value, expected, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an inline list`);
    return;
  }
  const duplicates = [...new Set(value.filter((item, index) => value.indexOf(item) !== index))];
  if (duplicates.length > 0) {
    errors.push(`${path} has duplicate values: ${duplicates.join(', ')}`);
  }
  const actual = [...new Set(value)].sort();
  const wanted = [...expected].sort();
  const unknown = actual.filter((item) => !wanted.includes(item));
  const missing = wanted.filter((item) => !actual.includes(item));
  if (unknown.length > 0) {
    errors.push(`${path} has unsupported values: ${unknown.join(', ')}`);
  }
  if (missing.length > 0) {
    errors.push(`${path} is missing values: ${missing.join(', ')}`);
  }
}

/**
 * Validate the stable STORY-025 policy surface. Live checkpoint and evidence
 * completion, including revision freshness and exception expiry, belong to STORY-026.
 */
export function validatePhase01Resolution(resolution) {
  const errors = [];
  expectExactKeys(
    resolution,
    ['schema', 'version', 'phase', 'conflicts', 'checkpoints', 'full_completion', 'exception_policies', 'coverage'],
    'resolution',
    errors,
  );
  if (!isMap(resolution)) {
    return errors;
  }
  expectScalar(resolution.schema, 'gomarkedit.phase-resolution', 'schema', errors);
  expectScalar(resolution.version, '1', 'version', errors);
  expectScalar(resolution.phase, '01', 'phase', errors);

  expectExactKeys(resolution.conflicts, ['PH01-X01'], 'conflicts', errors);
  expectExactKeys(resolution.conflicts?.['PH01-X01'], ['status', 'accepted_adr'], 'conflicts.PH01-X01', errors);
  expectScalar(resolution.conflicts?.['PH01-X01']?.status, 'resolved', 'conflicts.PH01-X01.status', errors);
  expectScalar(resolution.conflicts?.['PH01-X01']?.accepted_adr, 'ADR-0016', 'conflicts.PH01-X01.accepted_adr', errors);

  expectExactKeys(resolution.checkpoints, ['preview', 'editing'], 'checkpoints', errors);
  for (const [checkpoint, requirements, prerequisites] of [
    ['preview', previewRequirements, []],
    ['editing', editingRequirements, ['preview']],
  ]) {
    const entry = resolution.checkpoints?.[checkpoint];
    expectExactKeys(entry, ['requirements', 'prerequisites'], `checkpoints.${checkpoint}`, errors);
    expectExactList(entry?.requirements, requirements, `checkpoints.${checkpoint}.requirements`, errors);
    expectExactList(entry?.prerequisites, prerequisites, `checkpoints.${checkpoint}.prerequisites`, errors);
  }

  expectExactKeys(resolution.full_completion, ['shared_requirements', 'required_ids'], 'full_completion', errors);
  expectExactList(resolution.full_completion?.shared_requirements, ['PH01-R15'], 'full_completion.shared_requirements', errors);
  expectExactKeys(resolution.full_completion?.required_ids, Object.keys(requiredIDs), 'full_completion.required_ids', errors);
  for (const [kind, ids] of Object.entries(requiredIDs)) {
    expectExactList(resolution.full_completion?.required_ids?.[kind], ids, `full_completion.required_ids.${kind}`, errors);
  }

  expectExactKeys(resolution.exception_policies, ['PH01-E06'], 'exception_policies', errors);
  const e06Policy = resolution.exception_policies?.['PH01-E06'];
  expectExactKeys(
    e06Policy,
    ['kind', 'accepted_adr', 'required_record_fields', 'allowed_deferred_platforms', 'expiry_boundary'],
    'exception_policies.PH01-E06',
    errors,
  );
  expectScalar(e06Policy?.kind, 'current-host-native', 'exception_policies.PH01-E06.kind', errors);
  expectScalar(e06Policy?.accepted_adr, 'ADR-0016', 'exception_policies.PH01-E06.accepted_adr', errors);
  expectExactList(e06Policy?.required_record_fields, e06RecordFields, 'exception_policies.PH01-E06.required_record_fields', errors);
  expectExactList(e06Policy?.allowed_deferred_platforms, ['windows', 'linux'], 'exception_policies.PH01-E06.allowed_deferred_platforms', errors);
  expectScalar(e06Policy?.expiry_boundary, 'before-phase15-release-or-platform-claim', 'exception_policies.PH01-E06.expiry_boundary', errors);

  expectExactKeys(resolution.coverage, ['version', 'transitions', 'contracts', 'edge_cases', 'evidence'], 'coverage', errors);
  expectScalar(resolution.coverage?.version, '1', 'coverage.version', errors);
  for (const key of ['transitions', 'contracts', 'edge_cases', 'evidence']) {
    expectMap(resolution.coverage?.[key], `coverage.${key}`, errors);
  }
  return errors;
}

export async function readAndValidatePhase01Resolution(root) {
  const path = resolve(root, 'docs', 'phase-resolutions', 'PH01.yaml');
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    return { errors: [`unable to read docs/phase-resolutions/PH01.yaml: ${error.message}`] };
  }
  try {
    const resolution = parsePhaseResolutionYAML(contents);
    return { resolution, errors: validatePhase01Resolution(resolution) };
  } catch (error) {
    return { errors: [error.message] };
  }
}

function resolveRoot(arguments_, cwd) {
  if (arguments_.length === 0) {
    return cwd;
  }
  if (arguments_.length === 2 && arguments_[0] === '--root') {
    return resolve(cwd, arguments_[1]);
  }
  throw new Error('usage: node scripts/phase-resolution.mjs [--root path]');
}

async function main() {
  let root;
  try {
    root = resolveRoot(process.argv.slice(2), process.cwd());
  } catch (error) {
    console.error(`phase-resolution: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const { errors } = await readAndValidatePhase01Resolution(root);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`phase-resolution: ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('phase-resolution: PH01 policy record valid');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
