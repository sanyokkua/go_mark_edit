import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import test from 'node:test';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../..');
const resultsScript = join(repoRoot, 'tools/verify/results.mjs');
const commonScript = join(repoRoot, 'scripts/lib/common.sh');

function fixtureDirectory() {
  const directory = join(repoRoot, '.local_tmp_files');
  mkdirSync(directory, { recursive: true });
  return mkdtempSync(join(directory, 'verification-test-'));
}

function runResults(...arguments_) {
  return spawnSync(process.execPath, [resultsScript, ...arguments_], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

void test('reports backend and frontend test counts as separate groups', () => {
  const runDirectory = fixtureDirectory();
  try {
    const goLog = [
      JSON.stringify({
        Action: 'run',
        Package: 'example/unit',
        Test: 'TestSave',
      }),
      JSON.stringify({
        Action: 'pass',
        Package: 'example/unit',
        Test: 'TestSave',
      }),
      JSON.stringify({
        Action: 'run',
        Package: 'example/unit',
        Test: 'TestCancel',
      }),
      JSON.stringify({
        Action: 'skip',
        Package: 'example/unit',
        Test: 'TestCancel',
      }),
    ].join('\n');
    writeFileSync(join(runDirectory, 'unit.log'), goLog);
    writeFileSync(
      join(runDirectory, 'frontend-unit-jest.json'),
      JSON.stringify({
        numTotalTests: 3,
        numPassedTests: 2,
        numFailedTests: 0,
        numPendingTests: 1,
        numTodoTests: 0,
      }),
    );

    const stage = runResults(
      'stage',
      '--name',
      'unit',
      '--command',
      'scripts/test unit',
      '--exit-code',
      '0',
      '--duration-ms',
      '12',
      '--log',
      join(runDirectory, 'unit.log'),
      '--output',
      join(runDirectory, 'unit.json'),
    );

    assert.equal(stage.status, 0, stage.stderr);
    const record = JSON.parse(
      readFileSync(join(runDirectory, 'unit.json'), 'utf8'),
    );
    assert.deepEqual(record.testCounts.backend, {
      total: 2,
      passed: 1,
      failed: 0,
      skipped: 1,
      todo: 0,
      status: 'available',
    });
    assert.deepEqual(record.testCounts.frontend, {
      total: 3,
      passed: 2,
      failed: 0,
      skipped: 1,
      todo: 0,
      status: 'available',
    });
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('reports failed and skipped backend/frontend tests and Playwright counts', () => {
  const runDirectory = fixtureDirectory();
  try {
    writeFileSync(
      join(runDirectory, 'unit.log'),
      [
        JSON.stringify({
          Action: 'run',
          Package: 'example/unit',
          Test: 'TestPass',
        }),
        JSON.stringify({
          Action: 'pass',
          Package: 'example/unit',
          Test: 'TestPass',
        }),
        JSON.stringify({
          Action: 'run',
          Package: 'example/unit',
          Test: 'TestFail',
        }),
        JSON.stringify({
          Action: 'fail',
          Package: 'example/unit',
          Test: 'TestFail',
        }),
        JSON.stringify({
          Action: 'run',
          Package: 'example/unit',
          Test: 'TestSkip',
        }),
        JSON.stringify({
          Action: 'skip',
          Package: 'example/unit',
          Test: 'TestSkip',
        }),
      ].join('\n'),
    );
    writeFileSync(
      join(runDirectory, 'frontend-unit-jest.json'),
      JSON.stringify({
        numTotalTests: 4,
        numPassedTests: 2,
        numFailedTests: 1,
        numPendingTests: 1,
        numTodoTests: 0,
      }),
    );

    const unit = runResults(
      'stage',
      '--name',
      'unit',
      '--command',
      'scripts/test unit',
      '--exit-code',
      '1',
      '--duration-ms',
      '12',
      '--log',
      join(runDirectory, 'unit.log'),
      '--output',
      join(runDirectory, 'unit.json'),
    );

    assert.equal(unit.status, 1, unit.stderr);
    const unitRecord = JSON.parse(
      readFileSync(join(runDirectory, 'unit.json'), 'utf8'),
    );
    assert.deepEqual(unitRecord.testCounts.backend, {
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      todo: 0,
      status: 'available',
    });
    assert.deepEqual(unitRecord.testCounts.frontend, {
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      todo: 0,
      status: 'available',
    });
    assert.equal(unitRecord.verdict, 'findings');
    assert.match(
      JSON.stringify(unitRecord.findings),
      /backend test count includes 1 failed test/,
    );
    assert.match(
      JSON.stringify(unitRecord.findings),
      /frontend test count includes 1 failed test/,
    );

    writeFileSync(join(runDirectory, 'e2e.log'), 'playwright output\n');
    writeFileSync(
      join(runDirectory, 'frontend-e2e-playwright.json'),
      JSON.stringify({
        stats: {
          expected: 4,
          unexpected: 1,
          flaky: 1,
          skipped: 2,
        },
      }),
    );

    const e2e = runResults(
      'stage',
      '--name',
      'e2e',
      '--command',
      'scripts/test e2e',
      '--exit-code',
      '1',
      '--duration-ms',
      '12',
      '--log',
      join(runDirectory, 'e2e.log'),
      '--output',
      join(runDirectory, 'e2e.json'),
    );

    assert.equal(e2e.status, 1, e2e.stderr);
    const e2eRecord = JSON.parse(
      readFileSync(join(runDirectory, 'e2e.json'), 'utf8'),
    );
    assert.deepEqual(e2eRecord.testCounts.frontend, {
      total: 8,
      passed: 5,
      failed: 1,
      skipped: 2,
      todo: 0,
      status: 'available',
    });
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('prints grouped counts and not-run stages in the human summary', () => {
  const runDirectory = fixtureDirectory();
  try {
    writeFileSync(
      join(runDirectory, 'unit.json'),
      JSON.stringify({
        name: 'unit',
        commands: ['scripts/test unit'],
        exitCode: 0,
        durationMs: 12,
        verdict: 'clean',
        testCounts: {
          backend: {
            total: 2,
            passed: 2,
            failed: 0,
            skipped: 0,
            todo: 0,
            status: 'available',
          },
          frontend: {
            total: 3,
            passed: 3,
            failed: 0,
            skipped: 0,
            todo: 0,
            status: 'available',
          },
        },
        collected: 5,
        findings: [],
      }),
    );
    writeFileSync(
      join(runDirectory, 'e2e.json'),
      JSON.stringify({
        name: 'e2e',
        commands: ['scripts/verify --skip e2e'],
        exitCode: 0,
        durationMs: 0,
        verdict: 'skipped',
        collected: 0,
        findings: [],
      }),
    );

    const summary = runResults(
      'summary',
      '--run-dir',
      runDirectory,
      '--output',
      join(runDirectory, 'summary.json'),
    );

    assert.equal(summary.status, 0, summary.stderr);
    assert.match(summary.stdout, /Unit \.{14} PASS/);
    assert.match(
      summary.stdout,
      /Backend \.{10} 2 total, 2 passed, 0 failed, 0 skipped/,
    );
    assert.match(
      summary.stdout,
      /Frontend \.{9} 3 total, 3 passed, 0 failed, 0 skipped/,
    );
    assert.match(summary.stdout, /Lint \.{14} NOT RUN/);
    assert.match(summary.stdout, /E2E \.{15} SKIPPED \(--skip e2e\)/);
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('keeps the final summary available when an auxiliary report is incomplete', () => {
  const runDirectory = fixtureDirectory();
  try {
    writeFileSync(
      join(runDirectory, 'unit.json'),
      JSON.stringify({
        name: 'unit',
        commands: ['scripts/test unit'],
        exitCode: 0,
        durationMs: 12,
        verdict: 'clean',
        collected: 0,
        findings: [],
      }),
    );
    writeFileSync(join(runDirectory, 'frontend-unit-jest.json'), '{');

    const summary = runResults(
      'summary',
      '--run-dir',
      runDirectory,
      '--expected',
      'unit',
      '--output',
      join(runDirectory, 'summary.json'),
    );

    assert.equal(summary.status, 0, summary.stderr);
    assert.match(summary.stdout, /Unit \.{14} PASS/);
    assert.equal(
      JSON.parse(readFileSync(join(runDirectory, 'summary.json'), 'utf8'))
        .stages.length,
      1,
    );
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('marks a missing frontend report as unreliable instead of zero tests', () => {
  const runDirectory = fixtureDirectory();
  try {
    const goLog = [
      JSON.stringify({
        Action: 'run',
        Package: 'example/unit',
        Test: 'TestSave',
      }),
      JSON.stringify({
        Action: 'pass',
        Package: 'example/unit',
        Test: 'TestSave',
      }),
    ].join('\n');
    writeFileSync(join(runDirectory, 'unit.log'), goLog);

    const stage = runResults(
      'stage',
      '--name',
      'unit',
      '--command',
      'scripts/test unit',
      '--exit-code',
      '0',
      '--duration-ms',
      '12',
      '--log',
      join(runDirectory, 'unit.log'),
      '--output',
      join(runDirectory, 'unit.json'),
    );

    assert.equal(stage.status, 1, stage.stderr);
    const record = JSON.parse(
      readFileSync(join(runDirectory, 'unit.json'), 'utf8'),
    );
    assert.equal(record.exitCode, 1);
    assert.deepEqual(record.testCounts.frontend, {
      total: null,
      passed: null,
      failed: null,
      skipped: null,
      todo: null,
      status: 'unavailable',
    });
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('streams stage output while preserving the command exit code', () => {
  const runDirectory = fixtureDirectory();
  try {
    const script = [
      `source ${shellQuote(commonScript)}`,
      `RUN_DIR=${shellQuote(runDirectory)}`,
      'export RUN_DIR',
      `capture_stage unit 'fake stage' bash -c 'printf "backend output\\n"; printf "frontend error\\n" >&2; exit 7'`,
    ].join('\n');
    const result = spawnSync('bash', ['-c', script], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stdout, /backend output/);
    assert.match(result.stdout, /frontend error/);
    assert.match(
      readFileSync(join(runDirectory, 'unit.log'), 'utf8'),
      /backend output/,
    );
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('parses a clean golangci report without printing its linter inventory', () => {
  const runDirectory = fixtureDirectory();
  try {
    const input = join(runDirectory, 'golangci-lint.json');
    const output = join(runDirectory, 'golangci-lint.summary.json');
    writeFileSync(
      input,
      `${JSON.stringify({
        Issues: [],
        Report: { Linters: [{ Name: 'arangolint' }, { Name: 'errcheck' }] },
      })}\n0 issues.\n`,
    );

    const result = runResults(
      'report',
      '--tool',
      'golangci-lint',
      '--input',
      input,
      '--output',
      output,
      '--exit-code',
      '0',
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /golangci-lint.*PASS/);
    assert.doesNotMatch(result.stdout, /arangolint/);
    assert.doesNotMatch(result.stdout, /\{"Issues"/);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), {
      tool: 'golangci-lint',
      status: 'available',
      exitCode: 0,
      counts: { files: 0, errors: 0, warnings: 0 },
      findings: [],
    });
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('counts golangci warnings without turning them into failures', () => {
  const runDirectory = fixtureDirectory();
  try {
    const input = join(runDirectory, 'golangci-lint.json');
    const output = join(runDirectory, 'golangci-lint.summary.json');
    writeFileSync(
      input,
      JSON.stringify({
        Issues: [
          {
            Severity: 'warning',
            FromLinter: 'godox',
            Text: 'TODO comment',
            Pos: { Filename: 'internal/app.go', Line: 4, Column: 2 },
          },
        ],
      }),
    );

    const result = runResults(
      'report',
      '--tool',
      'golangci-lint',
      '--input',
      input,
      '--output',
      output,
      '--exit-code',
      '0',
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /golangci-lint.*0 errors, 1 warning/);
    assert.doesNotMatch(result.stdout, /TODO comment/);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')).counts, {
      files: 1,
      errors: 0,
      warnings: 1,
    });
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('prints ESLint errors and Stylelint warnings as concise diagnostics', () => {
  const runDirectory = fixtureDirectory();
  try {
    const eslintInput = join(runDirectory, 'eslint.json');
    const eslintOutput = join(runDirectory, 'eslint.summary.json');
    writeFileSync(
      eslintInput,
      JSON.stringify([
        {
          filePath: 'frontend/src/App.tsx',
          errorCount: 1,
          warningCount: 1,
          messages: [
            {
              ruleId: 'no-console',
              severity: 2,
              message: 'Unexpected console statement.',
              line: 12,
              column: 4,
            },
            {
              ruleId: 'style-warning',
              severity: 1,
              message: 'Style warning.',
              line: 20,
              column: 2,
            },
          ],
        },
      ]),
    );

    const eslint = runResults(
      'report',
      '--tool',
      'eslint',
      '--input',
      eslintInput,
      '--output',
      eslintOutput,
      '--exit-code',
      '1',
    );

    assert.equal(eslint.status, 1, eslint.stderr);
    assert.match(eslint.stdout, /ESLint.*1 error, 1 warning/);
    assert.match(eslint.stdout, /frontend\/src\/App\.tsx:12:4/);
    assert.doesNotMatch(eslint.stdout, /\{"filePath"/);

    const stylelintInput = join(runDirectory, 'stylelint.json');
    const stylelintOutput = join(runDirectory, 'stylelint.summary.json');
    writeFileSync(
      stylelintInput,
      JSON.stringify([
        {
          source: 'frontend/src/App.css',
          warnings: [
            {
              line: 4,
              column: 2,
              rule: 'color-no-invalid-hex',
              text: 'Unexpected invalid hex color.',
              severity: 'warning',
            },
          ],
        },
      ]),
    );

    const stylelint = runResults(
      'report',
      '--tool',
      'stylelint',
      '--input',
      stylelintInput,
      '--output',
      stylelintOutput,
      '--exit-code',
      '0',
    );

    assert.equal(stylelint.status, 0, stylelint.stderr);
    assert.match(stylelint.stdout, /Stylelint.*0 errors, 1 warning/);
    assert.doesNotMatch(stylelint.stdout, /\{"source"/);
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('parses Go JSON test events and prints only the useful failure summary', () => {
  const runDirectory = fixtureDirectory();
  try {
    const input = join(runDirectory, 'go-unit.jsonl');
    const output = join(runDirectory, 'go-unit.summary.json');
    writeFileSync(
      input,
      [
        { Action: 'run', Package: 'example/unit', Test: 'TestPass' },
        { Action: 'pass', Package: 'example/unit', Test: 'TestPass' },
        { Action: 'run', Package: 'example/unit', Test: 'TestFail' },
        { Action: 'fail', Package: 'example/unit', Test: 'TestFail' },
        { Action: 'run', Package: 'example/unit', Test: 'TestSkip' },
        { Action: 'skip', Package: 'example/unit', Test: 'TestSkip' },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n'),
    );

    const result = runResults(
      'report',
      '--tool',
      'go-test',
      '--input',
      input,
      '--output',
      output,
      '--exit-code',
      '1',
    );

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /Go tests.*1 failed/);
    assert.match(result.stdout, /TestFail/);
    assert.doesNotMatch(result.stdout, /\{"Action":"run"/);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(report.testCounts, {
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      todo: 0,
      status: 'available',
    });
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('marks malformed reports unreliable instead of inventing zero counts', () => {
  const runDirectory = fixtureDirectory();
  try {
    const input = join(runDirectory, 'eslint.json');
    const output = join(runDirectory, 'eslint.summary.json');
    writeFileSync(input, '{not-json');

    const result = runResults(
      'report',
      '--tool',
      'eslint',
      '--input',
      input,
      '--output',
      output,
      '--exit-code',
      '0',
    );

    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stdout, /ESLint.*UNRELIABLE/);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).status, 'unreliable');

    const missingOutput = join(runDirectory, 'missing.summary.json');
    const missing = runResults(
      'report',
      '--tool',
      'eslint',
      '--input',
      join(runDirectory, 'missing.json'),
      '--output',
      missingOutput,
      '--exit-code',
      '0',
    );
    assert.equal(missing.status, 3, missing.stderr);
    assert.match(missing.stdout, /ESLint.*UNAVAILABLE/);
    assert.equal(
      JSON.parse(readFileSync(missingOutput, 'utf8')).status,
      'unavailable',
    );
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('runs structured commands through a raw report file without losing the command exit code', () => {
  const runDirectory = fixtureDirectory();
  try {
    const report = join(runDirectory, 'reports', 'go-unit.jsonl');
    const script = [
      `source ${shellQuote(commonScript)}`,
      `RUN_DIR=${shellQuote(runDirectory)}`,
      'export RUN_DIR',
      `run_reported_command 'Go backend unit tests' go-test ${shellQuote(report)} bash -c 'printf "{\\"Action\\":\\"run\\",\\"Package\\":\\"example/unit\\",\\"Test\\":\\"TestFail\\"}\\n"; printf "failure details\\n" >&2; exit 7'`,
    ].join('\n');
    const result = spawnSync('bash', ['-c', script], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stdout, /Go backend unit tests/);
    assert.match(result.stdout, /UNRELIABLE|Go tests/);
    assert.match(result.stderr, /failure details/);
    assert.match(readFileSync(report, 'utf8'), /TestFail/);
    assert.doesNotMatch(result.stdout, /\{"Action"/);
  } finally {
    rmSync(runDirectory, { recursive: true, force: true });
  }
});

void test('ignores Feature 003 evidence paths for repository scans', () => {
  const evidencePath = 'specs/003-real-files-and-tabs/evidence/generated.json';
  const result = spawnSync('git', ['check-ignore', '-q', evidencePath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);

  const formatSource = readFileSync(join(repoRoot, 'scripts/format'), 'utf8');
  assert.match(formatSource, /specs\/\*\/evidence\/\*/);
  const evidenceFile = join(repoRoot, evidencePath);
  mkdirSync(join(repoRoot, 'specs/003-real-files-and-tabs/evidence'), {
    recursive: true,
  });
  writeFileSync(evidenceFile, '{"generated":true}\n');
  try {
    const selected = spawnSync(
      'git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        evidencePath,
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(selected.stdout, '');
  } finally {
    rmSync(join(repoRoot, 'specs/003-real-files-and-tabs/evidence'), {
      recursive: true,
      force: true,
    });
  }
});

void test('keeps baseline creation and comparison owned by scripts/baseline', () => {
  for (const entrypoint of ['scripts/verify', 'scripts/test']) {
    const source = readFileSync(join(repoRoot, entrypoint), 'utf8');
    assert.doesNotMatch(source, /\b(?:baseline|compare)\b/);
  }

  const baselineSource = readFileSync(
    join(repoRoot, 'scripts/baseline'),
    'utf8',
  );
  assert.match(baselineSource, /results\.mjs.*(?:baseline|compare)/s);
});
