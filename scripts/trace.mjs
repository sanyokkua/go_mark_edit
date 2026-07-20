import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildTraceRecord, renderTraceRecord } from './trace-common.mjs';

const root = resolve(import.meta.dirname, '..');
const { record } = await buildTraceRecord(root);
await writeFile(resolve(root, 'docs/traceability.yaml'), renderTraceRecord(record));
