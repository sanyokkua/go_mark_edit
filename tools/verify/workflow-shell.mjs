import { readFileSync } from 'node:fs';

/** @param {string} line */
function indentation(line) {
    return line.match(/^ */u)?.[0].length ?? 0;
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
