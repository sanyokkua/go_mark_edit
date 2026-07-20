import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildTraceRecord,
  normalizeGeneratedAt,
  renderTraceRecord,
  validateTraceInputs,
} from './trace-common.mjs';

const root = resolve(import.meta.dirname, '..');
const tracePath = resolve(root, 'docs/traceability.yaml');
const { record, stories, provingTests } = await buildTraceRecord(root);
const validationErrors = await validateTraceInputs(root, stories, provingTests);
const currentTrace = await readFile(tracePath, 'utf8');
const currentJson = currentTrace.slice(currentTrace.indexOf('{'));

try {
  const currentRecord = JSON.parse(currentJson);
  if (JSON.stringify(normalizeGeneratedAt(currentRecord)) !== JSON.stringify(normalizeGeneratedAt(record))) {
    validationErrors.push('docs/traceability.yaml is stale; run just trace');
  }
} catch {
  validationErrors.push('docs/traceability.yaml is not generated JSON-compatible YAML');
}

if (validationErrors.length > 0) {
  console.error(validationErrors.join('\n'));
  process.exitCode = 1;
} else if (currentTrace !== renderTraceRecord({ ...record, generated_at: JSON.parse(currentJson).generated_at })) {
  console.error('docs/traceability.yaml formatting is stale; run just trace');
  process.exitCode = 1;
}
