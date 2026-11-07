import { readFileSync } from 'node:fs';

/** @param {string} line */
function indentation(line) {
    return /^ */u.exec(line)?.[0].length ?? 0;
}

/**
 * Read the literal shell block of a named GitHub Actions step.
 * @param {string} workflowPath
 * @param {string} stepName
 * @returns {string}
 */
export function workflowStepRun(workflowPath, stepName) {
    const workflow = /** @type {unknown} */ (readFileSync(workflowPath, 'utf8'));
    if (typeof workflow !== 'string') throw new Error(`could not read ${workflowPath}`);
    const lines = workflow.split('\n');
    const stepIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
    if (stepIndex < 0) throw new Error(`missing ${stepName} step`);
    const stepIndent = indentation(lines[stepIndex]);
    let runIndex = stepIndex + 1;
    while (runIndex < lines.length && (lines[runIndex].trim() === '' || indentation(lines[runIndex]) > stepIndent)) {
        if (/^\s*run: \|\s*$/u.test(lines[runIndex])) break;
        runIndex++;
    }
    if (runIndex === lines.length || !/^\s*run: \|\s*$/u.test(lines[runIndex])) {
        throw new Error(`missing ${stepName} command`);
    }
    const runIndent = indentation(lines[runIndex]);
    const block = [];
    for (let index = runIndex + 1; index < lines.length; index++) {
        const line = lines[index];
        if (line.trim() !== '' && indentation(line) <= runIndent) break;
        block.push(line);
    }
    const contentIndent = Math.min(...block.filter((line) => line.trim() !== '').map(indentation));
    if (!Number.isFinite(contentIndent)) throw new Error(`empty ${stepName} command`);
    return block.map((line) => (line.trim() === '' ? '' : line.slice(contentIndent))).join('\n');
}

/**
 * Read a single-line scalar field (for example `if` or `needs`) of a top-level job.
 * @param {string} workflowPath
 * @param {string} jobName
 * @param {string} field
 * @returns {string | undefined}
 */
export function workflowJobField(workflowPath, jobName, field) {
    const lines = readFileSync(workflowPath, 'utf8').split('\n');
    const jobsIndex = lines.indexOf('jobs:');
    if (jobsIndex < 0) throw new Error(`missing jobs in ${workflowPath}`);
    const jobIndex = lines.findIndex((line, index) => index > jobsIndex && line === `    ${jobName}:`);
    if (jobIndex < 0) throw new Error(`missing ${jobName} job`);
    for (let index = jobIndex + 1; index < lines.length; index++) {
        const line = lines[index];
        if (line.trim() !== '' && indentation(line) <= 4) break;
        if (indentation(line) === 8 && line.trim().startsWith(`${field}: `)) return line.trim().slice(field.length + 2);
    }
    return undefined;
}

/**
 * Read a single-line scalar field (for example `if`) of a named step.
 * @param {string} workflowPath
 * @param {string} stepName
 * @param {string} field
 * @returns {string | undefined}
 */
export function workflowStepField(workflowPath, stepName, field) {
    const lines = readFileSync(workflowPath, 'utf8').split('\n');
    const stepIndex = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
    if (stepIndex < 0) throw new Error(`missing ${stepName} step`);
    const stepIndent = indentation(lines[stepIndex]);
    for (let index = stepIndex + 1; index < lines.length; index++) {
        const line = lines[index];
        if (line.trim() !== '' && indentation(line) <= stepIndent) break;
        if (indentation(line) === stepIndent + 2 && line.trim().startsWith(`${field}: `)) {
            return line.trim().slice(field.length + 2);
        }
    }
    return undefined;
}
