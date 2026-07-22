#!/usr/bin/env node

import process from 'node:process';
import { parseAndValidatePhases, resolvePhaseCLIArguments } from './phase-common.mjs';

const { root } = resolvePhaseCLIArguments(process.argv.slice(2), process.cwd());
const { phases, errors } = await parseAndValidatePhases(root);

if (phases.length === 0) {
  errors.push('no PHASE_NN Markdown documents found');
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`phase-check: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`phase-check: ${phases.length} phase documents valid`);
}
