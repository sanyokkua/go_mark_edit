import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const commitPattern = /^[0-9a-f]{40}$/;

/** @typedef {{ full_name?: string }} Repository */
/** @typedef {{ path?: string, sha?: string }} WorkflowReference */
/**
 * @typedef {{
 *   id?: number,
 *   run_attempt?: number,
 *   event?: string,
 *   head_branch?: string,
 *   head_sha?: string,
 *   status?: string,
 *   conclusion?: string | null,
 *   path?: string,
 *   repository?: Repository,
 *   head_repository?: Repository,
 *   referenced_workflows?: WorkflowReference[]
 * }} WorkflowRun
 */
/** @typedef {{ total_count?: number, workflow_runs?: WorkflowRun[] }} WorkflowRunList */
/** @typedef {{ name?: string, head_sha?: string, conclusion?: string }} WorkflowJob */
/** @typedef {{ total_count?: number, jobs?: WorkflowJob[] }} WorkflowJobList */

/** @param {WorkflowRunList | null | undefined} response @param {string} sha @param {string} repository */
export function chooseVerification(response, sha, repository) {
    if (!commitPattern.test(sha) || !repository || !Array.isArray(response?.workflow_runs)) {
        return { mode: 'reject' };
    }
    if (!Number.isInteger(response.total_count) || response.total_count > response.workflow_runs.length) {
        return { mode: 'reject' };
    }
    const matches = response.workflow_runs.filter(
        (run) =>
            run.event === 'push' &&
            run.head_branch === 'master' &&
            run.head_sha === sha &&
            run.repository?.full_name === repository &&
            run.head_repository?.full_name === repository &&
            /^\.github\/workflows\/push\.yml@(refs\/heads\/)?master$/.test(run.path),
    );
    if (matches.length === 0) return { mode: 'fallback' };
    matches.sort((a, b) => b.id - a.id);
    const latest = matches[0];
    if (!Number.isInteger(latest.id) || latest.id < 1) return { mode: 'reject' };
    return { mode: 'inspect', id: latest.id };
}

/** @param {WorkflowRun | null | undefined} run @param {string} sha @param {string} repository @param {number} selectedId */
export function assessRun(run, sha, repository, selectedId) {
    if (
        !commitPattern.test(sha) ||
        !Number.isInteger(selectedId) ||
        run?.id !== selectedId ||
        run.event !== 'push' ||
        run.head_branch !== 'master' ||
        run.head_sha !== sha ||
        run.repository?.full_name !== repository ||
        run.head_repository?.full_name !== repository ||
        !/^\.github\/workflows\/push\.yml@(refs\/heads\/)?master$/.test(run.path) ||
        !Number.isInteger(run.run_attempt) ||
        run.run_attempt < 1
    ) {
        return { mode: 'reject' };
    }
    if (run.status !== 'completed') return { mode: 'fallback' };
    if (run.conclusion !== 'success') return { mode: 'reject' };
    // A local `uses: ./.github/workflows/verification.yml` is reported as a referenced workflow whose
    // path ends in `@<ref>` and whose `sha` is the commit it ran at (observed for a manual release run;
    // not yet observed for a master push, whose run predates the reusable workflow). Anything else,
    // including an absent or empty list, cannot prove the revision and falls back to fresh verification.
    const reference = run.referenced_workflows?.find((workflow) =>
        workflow.path?.startsWith(`${repository}/.github/workflows/verification.yml@`),
    );
    if (reference?.sha !== sha) return { mode: 'fallback' };
    return { mode: 'reuse', id: selectedId, attempt: run.run_attempt };
}

/** @param {WorkflowJobList | null | undefined} response @param {string} sha */
export function assessRequiredJob(response, sha) {
    if (!commitPattern.test(sha) || !Array.isArray(response?.jobs) || response.total_count !== response.jobs.length) {
        return false;
    }
    const required = response.jobs.filter((job) => job.name === 'verify / required' || job.name === 'required');
    return required.length === 1 && required[0].head_sha === sha && required[0].conclusion === 'success';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [, , operation, sha, repository, selectedId] = process.argv;
    /** @type {unknown} */
    const response = JSON.parse(readFileSync(0, 'utf8'));
    if (operation === 'choose') {
        process.stdout.write(
            `${JSON.stringify(chooseVerification(/** @type {WorkflowRunList} */ (response), sha, repository))}\n`,
        );
    } else if (operation === 'inspect') {
        process.stdout.write(
            `${JSON.stringify(assessRun(/** @type {WorkflowRun} */ (response), sha, repository, Number(selectedId)))}\n`,
        );
    } else if (operation === 'required') {
        if (!assessRequiredJob(/** @type {WorkflowJobList} */ (response), sha)) process.exitCode = 1;
    } else {
        throw new Error(`unknown operation: ${operation}`);
    }
}
