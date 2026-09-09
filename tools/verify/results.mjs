#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const STAGES = ['lint', 'format', 'build', 'unit', 'integration', 'e2e'];
const FINDING_TOOLS = new Set([
  'golangci-lint',
  'archlint',
  'tsc',
  'eslint',
  'stylelint',
  'tokens',
  'repo-rules',
  'gofmt',
  'prettier',
  'shfmt',
  'go-test',
  'jest',
  'playwright',
  'build',
]);

function fail(message, code = 2) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
  let key = null;
  for (const value of argv) {
    if (value.startsWith('--')) {
      key = value.slice(2);
      args[key] = true;
    } else if (key) {
      args[key] = value;
      key = null;
    }
  }
  return args;
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function findingTool(stage, line) {
  if (/golangci|lint/i.test(line)) return 'golangci-lint';
  if (/eslint/i.test(line)) return 'eslint';
  if (/typescript|tsc|TS\d{4}/i.test(line)) return 'tsc';
  if (/stylelint/i.test(line)) return 'stylelint';
  if (/shfmt/i.test(line)) return 'shfmt';
  if (/prettier/i.test(line)) return 'prettier';
  if (/playwright/i.test(line)) return 'playwright';
  if (/jest/i.test(line)) return 'jest';
  if (/go test|--- FAIL|FAIL\s/i.test(line)) return 'go-test';
  if (/build|wails|missing tool/i.test(line)) return 'build';
  return stage === 'lint'
    ? 'repo-rules'
    : stage === 'e2e'
      ? 'playwright'
      : stage === 'unit' || stage === 'integration'
        ? 'go-test'
        : stage;
}

function commandTool(line) {
  if (/golangci-lint/i.test(line)) return 'golangci-lint';
  if (/typescript|\btsc\b/i.test(line)) return 'tsc';
  if (/eslint/i.test(line)) return 'eslint';
  if (/stylelint/i.test(line)) return 'stylelint';
  if (/shfmt/i.test(line)) return 'shfmt';
  if (/prettier/i.test(line)) return 'prettier';
  if (/playwright/i.test(line)) return 'playwright';
  if (/jest/i.test(line)) return 'jest';
  if (/go (?:unit|integration) tests|go test/i.test(line)) return 'go-test';
  if (/architecture checks|archlint/i.test(line)) return 'archlint';
  if (/build|wails/i.test(line)) return 'build';
  return null;
}

function findingLocation(stage, line) {
  const match = line.match(
    /((?:[^\s:]+\/)*[^\s:]+\.(?:go|ts|tsx|js|mjs|css|sh|md|json|yml|yaml))(?::\d+(?::\d+)?)?/,
  );
  if (match) return match[1];
  return stage;
}

function parseFindings(stage, log) {
  const findings = [];
  let activeTool = null;

  function addFinding(tool, location, message) {
    findings.push({
      id: `${tool}:${location}:failure`,
      tool: FINDING_TOOLS.has(tool) ? tool : 'build',
      location,
      message: message.slice(0, 500),
    });
  }

  for (const rawLine of log.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('+ ')) {
      activeTool = commandTool(line);
      continue;
    }

    if (line.startsWith('[') || line.startsWith('{')) {
      try {
        const parsed = JSON.parse(line);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        let parsedFinding = false;
        for (const entry of entries) {
          if (!entry || typeof entry !== 'object') continue;
          const messages = Array.isArray(entry.messages) ? entry.messages : [];
          const errors = messages.filter(
            (message) => message && (message.severity >= 2 || message.fatal),
          );
          if (
            errors.length === 0 &&
            !(entry.errorCount > 0 || entry.fatalErrorCount > 0)
          )
            continue;
          const tool = activeTool || 'eslint';
          const location = entry.filePath || stage;
          for (const message of errors) {
            const rule = message.ruleId || message.messageId || 'failure';
            addFinding(tool, `${location}:${rule}`, message.message || rule);
          }
          if (errors.length === 0)
            addFinding(tool, location, 'reported one or more errors');
          parsedFinding = true;
        }
        if (
          parsedFinding ||
          Array.isArray(parsed) ||
          (parsed && typeof parsed === 'object')
        )
          continue;
      } catch {
        // Non-JSON diagnostic lines are handled below.
      }
    }

    if (
      /^(?:ℹ\s*)?(?:fail(?:ed|ure)?|failed)\s+0\b/i.test(line) ||
      /\b0\s+failed\b/i.test(line)
    )
      continue;

    if (
      !/(error|fail|failed|missing tool|not found|cannot|panic|✖|✗|\bFAIL\b)/i.test(
        line,
      )
    )
      continue;
    const tool = activeTool || findingTool(stage, line);
    const location = findingLocation(stage, line);
    addFinding(tool, location, line);
  }
  const unique = new Map(findings.map((finding) => [finding.id, finding]));
  return [...unique.values()];
}

function countCollected(stage, log, findings) {
  const markers = log.match(
    /(?:=== RUN|^ok |^PASS|^FAIL|Tests:|\bpassed\b|\bfailed\b|\btest\b)/gim,
  );
  if (markers?.length) return markers.length;
  if (findings.length) return findings.length;
  return log.trim() ? 1 : 0;
}

function makeStage({ name, command, exitCode, durationMs = 0, log = '' }) {
  const findings = exitCode === 0 ? [] : parseFindings(name, log);
  let verdict;
  if (exitCode === 0) verdict = 'clean';
  else if (['format', 'build'].includes(name)) verdict = 'failing';
  else if (findings.length === 0) verdict = 'unreliable';
  else verdict = 'findings';
  return {
    name,
    commands: [command],
    exitCode,
    durationMs,
    verdict,
    collected: countCollected(name, log, findings),
    findings,
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function stageCommand(args) {
  const name = args.name;
  const logFile = args.log;
  const output = args.output;
  const exitCode = Number(args['exit-code']);
  const durationMs = Number(args['duration-ms'] ?? 0);
  if (
    !STAGES.includes(name) ||
    !logFile ||
    !output ||
    !Number.isInteger(exitCode)
  )
    fail('stage requires --name, --exit-code, --log and --output');
  if (!Number.isInteger(durationMs) || durationMs < 0)
    fail('stage requires a non-negative integer --duration-ms');
  const stage = makeStage({
    name,
    command: args.command || name,
    exitCode,
    durationMs,
    log: readText(logFile),
  });
  writeJson(output, stage);
}

function skippedCommand(args) {
  if (!STAGES.includes(args.name) || !args.output)
    fail('skipped requires --name and --output');
  writeJson(args.output, {
    name: args.name,
    commands: [args.command || args.name],
    exitCode: 0,
    durationMs: 0,
    verdict: 'skipped',
    collected: 0,
    findings: [],
  });
}

function stageFiles(runDir) {
  if (!fs.existsSync(runDir)) fail(`missing run directory: ${runDir}`);
  const stages = new Map();
  for (const file of fs.readdirSync(runDir)) {
    if (!file.endsWith('.json') || file === 'summary.json') continue;
    const value = JSON.parse(readText(path.join(runDir, file)));
    if (STAGES.includes(value.name)) stages.set(value.name, value);
  }
  return STAGES.filter((name) => stages.has(name)).map((name) =>
    stages.get(name),
  );
}

function summaryCommand(args) {
  const stages = stageFiles(args['run-dir']);
  const durationMs = stages.reduce(
    (total, stage) => total + stage.durationMs,
    0,
  );
  const exitCode = stages.find((stage) => stage.exitCode !== 0)?.exitCode ?? 0;
  const summary = {
    runId: path.basename(args['run-dir']),
    durationMs,
    exitCode,
    stages,
  };
  if (args.output) writeJson(args.output, summary);
  else process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (exitCode !== 0) process.exit(exitCode);
}

function commandOutput(command, commandArgs, cwd = process.cwd()) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unavailable';
}

function gitOutput(args) {
  const result = spawnSync('git', args, { encoding: 'buffer' });
  return result.status === 0 ? result.stdout : Buffer.alloc(0);
}

function baselineCommand(args) {
  const output = args.output;
  const runDir = args['run-dir'];
  const feature = args.feature;
  if (!output || !runDir || !feature)
    fail('baseline requires --feature, --run-dir and --output');
  const stages = stageFiles(runDir);
  if (stages.length !== STAGES.length)
    fail('baseline requires all six stage records');
  if (stages.some((stage) => stage.verdict === 'unreliable'))
    fail(
      'baseline is unreliable; a stage exited non-zero without parseable findings',
      3,
    );
  const diff = args['diff-file']
    ? fs.readFileSync(args['diff-file'])
    : gitOutput(['diff', 'HEAD']);
  const status = (
    args['status-file']
      ? fs.readFileSync(args['status-file'])
      : gitOutput(['status', '--porcelain', '-z'])
  ).toString('utf8');
  const untrackedPaths = status
    .split('\0')
    .filter(Boolean)
    .filter((entry) => entry.slice(0, 2) === '??')
    .map((entry) => entry.slice(3));
  const frontendRoot = path.join(
    process.env.REPO_ROOT || process.cwd(),
    'frontend',
  );
  const tools = {
    go: commandOutput('go', ['version']),
    node: commandOutput('node', ['--version']),
    npm: commandOutput('npm', ['--version']),
    wails: commandOutput('wails', ['version']),
    golangciLint: commandOutput('golangci-lint', ['--version']),
    shfmt: commandOutput('shfmt', ['--version']),
    prettier: commandOutput(
      'npx',
      ['--no-install', 'prettier', '--version'],
      frontendRoot,
    ),
    playwright: commandOutput(
      'npx',
      ['--no-install', 'playwright', '--version'],
      frontendRoot,
    ),
  };
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit))
    fail('baseline could not determine the full commit');
  const record = {
    schemaVersion: 1,
    feature,
    capturedAt: new Date().toISOString(),
    commit,
    dirtyDiffSha256: crypto.createHash('sha256').update(diff).digest('hex'),
    untrackedPaths,
    host: { os: os.platform(), arch: os.arch() },
    tools,
    stages,
  };
  writeJson(output, record);
  process.stdout.write(`Wrote ${output}\n`);
}

function compareCommand(args) {
  const baseline = args.baseline;
  const runDir = args['run-dir'];
  if (!baseline || !runDir) fail('compare requires --baseline and --run-dir');
  if (!fs.existsSync(baseline)) fail(`missing baseline input: ${baseline}`);
  const record = JSON.parse(readText(baseline));
  if (
    record.schemaVersion !== 1 ||
    !Array.isArray(record.stages) ||
    record.stages.length !== 6
  )
    fail('baseline input is missing required fields');
  const current = new Map(
    stageFiles(runDir).map((stage) => [stage.name, stage]),
  );
  let failed = false;
  for (const previous of record.stages) {
    const now = current.get(previous.name);
    if (!now) {
      console.log(
        `${previous.name}: findings remaining; current stage missing`,
      );
      failed = true;
      continue;
    }
    const previousIds = new Set(previous.findings.map((finding) => finding.id));
    const currentIds = new Set(now.findings.map((finding) => finding.id));
    const gone = [...previousIds].filter((id) => !currentIds.has(id));
    const added = [...currentIds].filter((id) => !previousIds.has(id));
    const remaining = [...currentIds].filter((id) => previousIds.has(id));
    const regressed = previous.exitCode === 0 && now.exitCode !== 0;
    console.log(
      `${previous.name}: findings gone=${gone.length} new=${added.length} remaining=${remaining.length}${regressed ? ' stage-regressed=yes' : ''}`,
    );
    if (
      added.length ||
      remaining.length ||
      regressed ||
      now.verdict === 'unreliable'
    )
      failed = true;
  }
  if (failed) process.exit(1);
}

const [command] = process.argv.slice(2);
const args = parseArgs(process.argv.slice(3));
switch (command) {
  case 'stage':
    stageCommand(args);
    break;
  case 'skipped':
    skippedCommand(args);
    break;
  case 'summary':
    summaryCommand(args);
    break;
  case 'baseline':
    baselineCommand(args);
    break;
  case 'compare':
    compareCommand(args);
    break;
  default:
    fail('usage: results.mjs <stage|skipped|summary|baseline|compare> ...');
}
