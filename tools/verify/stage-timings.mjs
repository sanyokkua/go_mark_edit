// Prints a Markdown table of per-stage durations from run summaries, for $GITHUB_STEP_SUMMARY.
// Usage: node tools/verify/stage-timings.mjs [runs-directory]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const runsDirectory = process.argv[2] ?? '.local_tmp_files/runs';
const rows = [];
if (existsSync(runsDirectory)) {
    const runs = readdirSync(runsDirectory).sort((a, b) => {
        if (a === b) return 0;
        return a < b ? -1 : 1;
    });
    for (const run of runs) {
        const summaryPath = path.join(runsDirectory, run, 'summary.json');
        if (!existsSync(summaryPath)) continue;
        const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
        for (const stage of summary.stages ?? []) {
            rows.push(`| ${stage.name} | ${stage.verdict ?? 'unknown'} | ${(stage.durationMs / 1000).toFixed(1)} |`);
        }
        rows.push(`| **${run} total** | | ${(summary.durationMs / 1000).toFixed(1)} |`);
    }
}
if (rows.length > 0) {
    console.log(['### Stage timings', '', '| Stage | Verdict | Seconds |', '| --- | --- | ---: |', ...rows].join('\n'));
}
