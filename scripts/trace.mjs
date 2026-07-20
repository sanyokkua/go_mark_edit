import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildTraceRecord, renderTraceRecord, resolveTraceRoot } from './trace-common.mjs';

const root = resolveTraceRoot(process.argv.slice(2), resolve(import.meta.dirname, '..'));
const { record } = await buildTraceRecord(root);
await writeFile(resolve(root, 'docs/traceability.yaml'), renderTraceRecord(record));
