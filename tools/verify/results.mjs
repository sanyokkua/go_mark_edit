#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const STAGES = ['lint', 'format', 'build', 'unit', 'integration', 'e2e'];
const TEST_STAGES = new Set(['unit', 'integration', 'e2e']);
const TEST_GROUPS = ['backend', 'frontend'];
const REPORT_TOOLS = new Set(['golangci-lint', 'eslint', 'stylelint', 'go-test']);
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

function readJson(file) {
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(readText(file));
    } catch {
        return null;
    }
}

function readFirstJsonLine(file) {
    if (!fs.existsSync(file)) return null;
    for (const rawLine of readText(file).split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
            return JSON.parse(line);
        } catch {
            return null;
        }
    }
    return null;
}

function readJsonLines(file) {
    if (!fs.existsSync(file)) return { values: [], invalidLines: [] };
    const values = [];
    const invalidLines = [];
    for (const [index, rawLine] of readText(file).split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
            values.push(JSON.parse(line));
        } catch {
            invalidLines.push(index + 1);
        }
    }
    return { values, invalidLines };
}

function reportFinding(tool, location, rule, message) {
    return {
        id: `${tool}:${location}:${rule || 'failure'}`,
        tool,
        location,
        message: String(message || rule || 'failure').slice(0, 500),
    };
}

function reportUnavailable(tool, exitCode, status = 'unavailable') {
    return {
        tool,
        status,
        exitCode,
        counts: { files: null, errors: null, warnings: null },
        findings: [],
    };
}

function diagnosticLocation(file, line, column) {
    const lineSuffix = line ? `:${line}` : '';
    const columnSuffix = column ? `:${column}` : '';
    return `${file}${lineSuffix}${columnSuffix}`;
}

function parseGolangciReport(report, exitCode) {
    if (!report || !Array.isArray(report.Issues)) return reportUnavailable('golangci-lint', exitCode, 'unreliable');
    const warnings = report.Issues.filter((issue) => String(issue?.Severity || '').toLowerCase() === 'warning').length;
    const findings = report.Issues.filter((issue) => String(issue?.Severity || '').toLowerCase() !== 'warning').map(
        (issue) => {
            const position = issue?.Pos || {};
            const file = position.Filename || 'golangci-lint';
            const location = diagnosticLocation(file, position.Line, position.Column);
            return reportFinding('golangci-lint', location, issue.FromLinter, issue.Text);
        },
    );
    const files = new Set(report.Issues.map((issue) => issue?.Pos?.Filename || 'golangci-lint'));
    return {
        tool: 'golangci-lint',
        status: 'available',
        exitCode,
        counts: {
            files: files.size,
            errors: report.Issues.length - warnings,
            warnings,
        },
        findings,
    };
}

function eslintFileCounts(file, messages) {
    const errors = Number.isInteger(file?.errorCount)
        ? file.errorCount
        : messages.filter((message) => message?.severity >= 2 || message?.fatal).length;
    const warnings = Number.isInteger(file?.warningCount)
        ? file.warningCount
        : messages.filter((message) => message?.severity === 1).length;
    return { errors, warnings };
}

function parseEslintReport(report, exitCode) {
    if (!Array.isArray(report)) return reportUnavailable('eslint', exitCode, 'unreliable');
    const findings = [];
    let errors = 0;
    let warnings = 0;
    for (const file of report) {
        const messages = Array.isArray(file?.messages) ? file.messages : [];
        const counts = eslintFileCounts(file, messages);
        errors += counts.errors;
        warnings += counts.warnings;
        for (const message of messages) {
            if (message?.severity < 2 && !message?.fatal) continue;
            const location = diagnosticLocation(file.filePath || 'eslint', message.line, message.column);
            findings.push(reportFinding('eslint', location, message.ruleId, message.message));
        }
    }
    return {
        tool: 'eslint',
        status: 'available',
        exitCode,
        counts: { files: report.length, errors, warnings },
        findings,
    };
}

function stylelintParseFindings(file) {
    const parseErrors = Array.isArray(file?.parseErrors) ? file.parseErrors : [];
    return parseErrors.map((error) => {
        const location = diagnosticLocation(file.source || 'stylelint', error.line, error.column);
        return reportFinding('stylelint', location, 'parse-error', error.text);
    });
}

function parseStylelintReport(report, exitCode) {
    if (!Array.isArray(report)) return reportUnavailable('stylelint', exitCode, 'unreliable');
    const findings = [];
    let errors = 0;
    let warnings = 0;
    for (const file of report) {
        const parseFindings = stylelintParseFindings(file);
        errors += parseFindings.length;
        for (const finding of parseFindings) findings.push(finding);
        const fileWarnings = Array.isArray(file?.warnings) ? file.warnings : [];
        for (const warning of fileWarnings) {
            if (String(warning.severity || 'warning').toLowerCase() === 'error') {
                errors += 1;
                const location = diagnosticLocation(file.source || 'stylelint', warning.line, warning.column);
                findings.push(reportFinding('stylelint', location, warning.rule, warning.text));
            } else {
                warnings += 1;
            }
        }
    }
    return {
        tool: 'stylelint',
        status: 'available',
        exitCode,
        counts: { files: report.length, errors, warnings },
        findings,
    };
}

/** @param {string} stage @param {string} line */
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
    return { lint: 'repo-rules', e2e: 'playwright', unit: 'go-test', integration: 'go-test' }[stage] ?? stage;
}

/** @param {string} line */
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

/** @param {string} token */
function locationInToken(token) {
    const extensions = ['go', 'tsx', 'ts', 'js', 'mjs', 'css', 'sh', 'md', 'json', 'yml', 'yaml'];
    let matchEnd = -1;
    for (let index = 1; index < token.length; index += 1) {
        if (token[index] !== '.') continue;
        const extension = extensions.find((value) => token.startsWith(value, index + 1));
        if (extension) matchEnd = index + 1 + extension.length;
    }
    return matchEnd === -1 ? null : token.slice(0, matchEnd);
}

/**
 * @param {string} stage
 * @param {string} line
 */
function findingLocation(stage, line) {
    for (const token of line.split(/[\s:]/)) {
        const location = locationInToken(token);
        if (location !== null) return location;
    }
    return stage;
}

/** @param {string} stage @param {string} line */
function ignoredFindingLine(stage, line) {
    // Playwright prints every passing title; words inside a title are not diagnostics.
    if (stage === 'e2e' && /^(?:\[\d+\/\d+\]\s+)?\[[^\]]+\]\s+›\s+tests\/e2e\//.test(line)) return true;
    if (/^(?:PASS|ok)\b/.test(line)) return true;
    return /^(?:golangci-lint|ESLint|Stylelint|Go tests)\s+\.+\s+(?:PASS|FAIL|SKIPPED|NOT RUN|UNAVAILABLE|UNRELIABLE)\b/.test(
        line,
    );
}

/** @param {string} line */
function isFailureLine(line) {
    if (/^(?:ℹ\s*)?(?:fail(?:ed|ure)?|failed)\s+0\b/i.test(line) || /\b0\s+failed\b/i.test(line)) return false;
    return /(error|fail|failed|missing tool|not found|cannot|panic|✖|✗|\bFAIL\b)/i.test(line);
}

/**
 * @param {string} tool
 * @param {string} stage
 * @param {(tool: string, location: string, message: string) => void} addFinding
 */
function addStructuredEntryFindings(entry, tool, stage, addFinding) {
    if (!entry || typeof entry !== 'object') return;
    const messages = Array.isArray(entry.messages) ? entry.messages : [];
    const errors = messages.filter((message) => message && (message.severity >= 2 || message.fatal));
    const location = entry.filePath || stage;
    for (const message of errors) {
        const rule = message.ruleId || message.messageId || 'failure';
        addFinding(tool, `${location}:${rule}`, message.message || rule);
    }
    if (errors.length === 0 && (entry.errorCount > 0 || entry.fatalErrorCount > 0)) {
        addFinding(tool, location, 'reported one or more errors');
    }
}

/**
 * @param {string} line
 * @param {string} tool
 * @param {string} stage
 * @param {(tool: string, location: string, message: string) => void} addFinding
 */
function addStructuredFindings(line, tool, stage, addFinding) {
    if (!line.startsWith('[') && !line.startsWith('{')) return false;
    try {
        const parsed = JSON.parse(line);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) addStructuredEntryFindings(entry, tool, stage, addFinding);
        return true;
    } catch {
        // Non-JSON diagnostic lines are handled by the caller.
        return false;
    }
}

/** @param {string} stage @param {string} log */
function parseFindings(stage, log) {
    const findings = [];
    let activeTool = null;

    /** @param {string} tool @param {string} location @param {string} message */
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
        if (!line || ignoredFindingLine(stage, line)) continue;

        if (line.startsWith('+ ')) {
            activeTool = commandTool(line);
            continue;
        }

        if (addStructuredFindings(line, activeTool || 'eslint', stage, addFinding) || !isFailureLine(line)) continue;
        const tool = activeTool || findingTool(stage, line);
        const location = findingLocation(stage, line);
        addFinding(tool, location, line);
    }
    const unique = new Map(findings.map((finding) => [finding.id, finding]));
    return [...unique.values()];
}

function emptyTestCount(status = 'unavailable') {
    return {
        total: null,
        passed: null,
        failed: null,
        skipped: null,
        todo: null,
        status,
    };
}

function testCount({ total, passed, failed, skipped, todo = 0 }) {
    const terminal = passed + failed + skipped + todo;
    return {
        total,
        passed,
        failed,
        skipped,
        todo,
        status: total > 0 && terminal === total ? 'available' : 'unreliable',
    };
}

function isGoTestEvent(event) {
    return event && typeof event === 'object' && typeof event.Package === 'string' && typeof event.Action === 'string';
}

function parseGoTestCounts(log) {
    let sawGoEvent = false;
    const counts = { run: 0, pass: 0, fail: 0, skip: 0 };

    for (const rawLine of log.split('\n')) {
        const line = rawLine.trim();
        if (!line.startsWith('{')) continue;
        try {
            const event = JSON.parse(line);
            if (!isGoTestEvent(event)) continue;
            sawGoEvent = true;
            if (typeof event.Test === 'string' && Object.hasOwn(counts, event.Action)) counts[event.Action] += 1;
        } catch {
            // Non-JSON diagnostics can be interleaved with Go's JSON event stream.
        }
    }

    if (!sawGoEvent) return null;
    return testCount({ total: counts.run, passed: counts.pass, failed: counts.fail, skipped: counts.skip });
}

function parseGoTestReport(input, exitCode) {
    const { values, invalidLines } = readJsonLines(input);
    if (values.length === 0 || invalidLines.length > 0) return reportUnavailable('go-test', exitCode, 'unreliable');

    const events = values.filter(isGoTestEvent);
    if (events.length !== values.length) return reportUnavailable('go-test', exitCode, 'unreliable');

    const testCounts = parseGoTestCounts(events.map((event) => JSON.stringify(event)).join('\n'));
    if (!testCounts) return reportUnavailable('go-test', exitCode, 'unreliable');

    const findings = events
        .filter((event) => event.Action === 'fail' && typeof event.Test === 'string')
        .map((event) =>
            reportFinding('go-test', `${event.Package}/${event.Test}`, event.Test, `failed test ${event.Test}`),
        );
    const packages = new Set(events.map((event) => event.Package));
    return {
        tool: 'go-test',
        status: testCounts.status === 'available' ? 'available' : 'unreliable',
        exitCode,
        counts: { files: packages.size, errors: testCounts.failed, warnings: 0 },
        testCounts,
        findings,
    };
}

function parseReport(tool, input, exitCode) {
    if (!REPORT_TOOLS.has(tool)) fail(`unsupported report tool: ${tool}`);
    if (!fs.existsSync(input)) return reportUnavailable(tool, exitCode);
    if (tool === 'go-test') return parseGoTestReport(input, exitCode);
    const report = tool === 'golangci-lint' ? readJson(input) || readFirstJsonLine(input) : readJson(input);
    if (tool === 'golangci-lint') return parseGolangciReport(report, exitCode);
    if (tool === 'eslint') return parseEslintReport(report, exitCode);
    return parseStylelintReport(report, exitCode);
}

function reportLabel(tool) {
    if (tool === 'go-test') return 'Go tests';
    if (tool === 'eslint') return 'ESLint';
    if (tool === 'stylelint') return 'Stylelint';
    return tool;
}

function pluralize(value, singular) {
    return `${value} ${singular}${value === 1 ? '' : 's'}`;
}

function reportSummaryLine(report) {
    if (report.status !== 'available') return `${reportLabel(report.tool)} ........ ${report.status.toUpperCase()}`;
    const result = report.exitCode === 0 ? 'PASS' : 'FAIL';
    if (report.tool === 'go-test') {
        const count = report.testCounts;
        return `${reportLabel(report.tool)} ........ ${result} — ${count.total} total, ${count.passed} passed, ${count.failed} failed, ${count.skipped} skipped`;
    }
    const { files, errors, warnings } = report.counts;
    if (report.tool === 'golangci-lint')
        return `${reportLabel(report.tool)} ........ ${result} — ${pluralize(errors + warnings, 'issue')}, ${pluralize(errors, 'error')}, ${pluralize(warnings, 'warning')}`;
    return `${reportLabel(report.tool)} ........ ${result} — ${pluralize(errors, 'error')}, ${pluralize(warnings, 'warning')}, ${pluralize(files, 'file')}`;
}

function formatReport(report) {
    const lines = [reportSummaryLine(report)];
    for (const finding of report.findings || []) lines.push(`  ${finding.location} ${finding.message}`);
    return `${lines.join('\n')}\n`;
}

function parseJestTestCounts(report) {
    if (!report || typeof report !== 'object') return null;
    const values = [
        report.numTotalTests,
        report.numPassedTests,
        report.numFailedTests,
        report.numPendingTests,
        report.numTodoTests,
    ];
    if (values.every((value) => Number.isInteger(value))) {
        const todo = report.numTodoTests;
        const skipped = Math.max(0, report.numPendingTests - todo);
        return testCount({
            total: report.numTotalTests,
            passed: report.numPassedTests,
            failed: report.numFailedTests,
            skipped,
            todo,
        });
    }

    const assertionResults = Array.isArray(report.testResults)
        ? report.testResults.flatMap((suite) => (Array.isArray(suite.assertionResults) ? suite.assertionResults : []))
        : [];
    if (assertionResults.length === 0) return null;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let todo = 0;
    for (const assertion of assertionResults) {
        if (assertion.status === 'passed') passed += 1;
        else if (assertion.status === 'failed') failed += 1;
        else if (assertion.status === 'todo') todo += 1;
        else skipped += 1;
    }
    return testCount({
        total: assertionResults.length,
        passed,
        failed,
        skipped,
        todo,
    });
}

function parsePlaywrightTestCounts(report) {
    if (!report || typeof report !== 'object') return null;
    const stats = report.stats;
    if (stats && typeof stats === 'object') {
        const expected = Number.isInteger(stats.expected) ? stats.expected : 0;
        const unexpected = Number.isInteger(stats.unexpected) ? stats.unexpected : 0;
        const flaky = Number.isInteger(stats.flaky) ? stats.flaky : 0;
        const skipped = Number.isInteger(stats.skipped) ? stats.skipped : 0;
        const total = expected + unexpected + flaky + skipped;
        return testCount({
            total,
            passed: expected + flaky,
            failed: unexpected,
            skipped,
        });
    }

    const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };
    function visit(suite) {
        if (!suite || typeof suite !== 'object') return;
        for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
            for (const result of Array.isArray(spec.tests) ? spec.tests : []) {
                counts.total += 1;
                if (result.status === 'skipped') counts.skipped += 1;
                else if (result.status === 'unexpected') counts.failed += 1;
                else counts.passed += 1;
            }
        }
        for (const child of Array.isArray(suite.suites) ? suite.suites : []) visit(child);
    }
    for (const suite of Array.isArray(report.suites) ? report.suites : []) visit(suite);
    if (counts.total === 0) return null;
    return testCount(counts);
}

function* playwrightTests(suite, inheritedFile) {
    const file = suite.file || inheritedFile;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
        for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
            yield { file: spec.file || file || 'unknown file', title: spec.title, test };
        }
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) yield* playwrightTests(child, file);
}

function recordAttemptLifecycle(attempt, lifecycle) {
    const stdout = (Array.isArray(attempt.stdout) ? attempt.stdout : [])
        .map((entry) => (typeof entry === 'string' ? entry : entry?.text || ''))
        .join('');
    for (const match of stdout.matchAll(/^\[e2e\] (launchMs|relaunchMs|teardownMs)=(\d+)(?:\s|$)/gm)) {
        const [, phase, duration] = match;
        lifecycle.records += 1;
        lifecycle[phase] += Number(duration);
        if (phase === 'launchMs') lifecycle.starts += 1;
        if (phase === 'relaunchMs') lifecycle.relaunches += 1;
    }
}

function recordPlaywrightTest({ file, title, test }, files, tests, lifecycle) {
    const attempts = Array.isArray(test.results) ? test.results : [];
    if (attempts.length === 0) return 0;
    const retries = attempts.filter((attempt) => attempt.retry > 0).length;
    const durationMs = attempts.reduce((total, attempt) => total + (Number(attempt.duration) || 0), 0);
    tests.push({ file, title, durationMs });
    files.set(file, (files.get(file) || 0) + durationMs);
    for (const attempt of attempts) recordAttemptLifecycle(attempt, lifecycle);
    return retries;
}

function parseE2eTiming(log, report, wallMs) {
    const preparation = log.match(/^\[e2e\] prepareMs=(\d+)(?:\s|$)/m);
    const timing = {
        wallMs,
        prepareMs: preparation ? Number(preparation[1]) : null,
        starts: null,
        relaunches: null,
        launchMs: null,
        relaunchMs: null,
        teardownMs: null,
        retries: null,
        failures: Number.isInteger(report?.stats?.unexpected) ? report.stats.unexpected : null,
        skipped: Number.isInteger(report?.stats?.skipped) ? report.stats.skipped : null,
        slowestTests: [],
        slowestFiles: [],
    };
    if (!report || !Array.isArray(report.suites)) return timing;

    const files = new Map();
    const tests = [];
    const lifecycle = { records: 0, starts: 0, relaunches: 0, launchMs: 0, relaunchMs: 0, teardownMs: 0 };
    let retries = 0;
    for (const suite of report.suites) {
        for (const entry of playwrightTests(suite, null)) {
            retries += recordPlaywrightTest(entry, files, tests, lifecycle);
        }
    }
    timing.retries = retries;
    if (lifecycle.records > 0) {
        const { starts, relaunches, launchMs, relaunchMs, teardownMs } = lifecycle;
        Object.assign(timing, { starts, relaunches, launchMs, relaunchMs, teardownMs });
    }
    timing.slowestTests = tests.toSorted((a, b) => b.durationMs - a.durationMs).slice(0, 3);
    timing.slowestFiles = [...files]
        .map(([file, durationMs]) => ({ file, durationMs }))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 3);
    return timing;
}

function readNormalizedReports(reportsDir, stage) {
    if (!reportsDir || !fs.existsSync(reportsDir)) return [];
    const reportPrefix = {
        lint: /^(?:golangci-lint|eslint|stylelint)\./,
        unit: /^go-unit[.-]/,
        integration: /^go-integration[.-]/,
    }[stage];
    if (!reportPrefix) return [];
    return fs
        .readdirSync(reportsDir)
        .filter((file) => file.endsWith('.summary.json') && reportPrefix.test(file))
        .map((file) => readJson(path.join(reportsDir, file)))
        .filter((report) => report && REPORT_TOOLS.has(report.tool));
}

function collectTestCounts(stage, log, runDir, reports = []) {
    if (!TEST_STAGES.has(stage)) return undefined;
    if (stage === 'e2e') {
        return {
            frontend:
                parsePlaywrightTestCounts(readJson(path.join(runDir, 'frontend-e2e-playwright.json'))) ||
                emptyTestCount(),
        };
    }
    const backendReport = reports.find((report) => report.tool === 'go-test');
    return {
        backend: backendReport?.testCounts || parseGoTestCounts(log) || emptyTestCount(),
        frontend: parseJestTestCounts(readJson(path.join(runDir, `frontend-${stage}-jest.json`))) || emptyTestCount(),
    };
}

function countUnavailableGroups(testCounts) {
    if (!testCounts) return [];
    return Object.entries(testCounts)
        .filter(([, count]) => count.status !== 'available' && count.status !== 'skipped')
        .map(([group]) => group);
}

function failedTestGroups(testCounts) {
    if (!testCounts) return [];
    return Object.entries(testCounts).filter(([, count]) => count.status === 'available' && count.failed > 0);
}

function countCollected(log, findings, testCounts) {
    if (testCounts) {
        const totals = Object.values(testCounts)
            .map((count) => count.total)
            .filter((total) => Number.isInteger(total));
        if (totals.length) return totals.reduce((total, value) => total + value, 0);
    }
    const markers = log.match(/(?:=== RUN|^ok |^PASS|^FAIL|Tests:|\bpassed\b|\bfailed\b|\btest\b)/gim);
    if (markers?.length) return markers.length;
    if (findings.length) return findings.length;
    return log.trim() ? 1 : 0;
}

function requiredReportFindings(stage, reportsDir, reports) {
    if (!reportsDir) return [];
    const tools = { lint: ['golangci-lint', 'eslint', 'stylelint'], unit: ['go-test'], integration: ['go-test'] };
    return (tools[stage] ?? [])
        .filter((tool) => reports.find((report) => report.tool === tool)?.status !== 'available')
        .map((tool) => ({
            id: `report:${stage}:${tool}:unavailable`,
            tool,
            location: `${stage}/${tool}`,
            message: `${tool} report is unavailable or unreliable`,
        }));
}

function testCountFinding(stage, group, status, message) {
    const tool = stage === 'e2e' ? 'playwright' : { backend: 'go-test', frontend: 'jest' }[group];
    return {
        id: `test-count:${stage}:${group}:${status}`,
        tool,
        location: `${stage}/${group}`,
        message,
    };
}

function testCountFindings(stage, testCounts) {
    const unavailable = countUnavailableGroups(testCounts).map((group) =>
        testCountFinding(stage, group, 'unavailable', `${group} test count is ${testCounts[group].status}`),
    );
    const failed = failedTestGroups(testCounts).map(([group, count]) => {
        const description = pluralize(count.failed, 'failed test');
        return testCountFinding(stage, group, 'failed', `${group} test count includes ${description}`);
    });
    return [...unavailable, ...failed];
}

function stageVerdict(name, exitCode, findings) {
    if (exitCode === 0) return 'clean';
    if (name === 'format' || name === 'build') return 'failing';
    return findings.length === 0 ? 'unreliable' : 'findings';
}

function makeStage({
    name,
    command,
    exitCode,
    durationMs = 0,
    log = '',
    runDir = path.dirname(process.cwd()),
    reportsDir,
}) {
    const reports = readNormalizedReports(reportsDir, name);
    const testCounts = collectTestCounts(name, log, runDir, reports);
    const e2eTiming =
        name === 'e2e'
            ? parseE2eTiming(log, readJson(path.join(runDir, 'frontend-e2e-playwright.json')), durationMs)
            : undefined;
    const reportFindings = reports.flatMap((report) => report.findings || []);
    const requiredFindings = [
        ...requiredReportFindings(name, reportsDir, reports),
        ...testCountFindings(name, testCounts),
    ];
    const effectiveExitCode = exitCode || (reportFindings.length > 0 || requiredFindings.length > 0 ? 1 : 0);
    let findings = [];
    if (effectiveExitCode !== 0) {
        const toolsWithReportFindings = new Set(reportFindings.map((finding) => finding.tool));
        const logFindings = parseFindings(name, log).filter((finding) => !toolsWithReportFindings.has(finding.tool));
        findings = [...logFindings, ...reportFindings, ...requiredFindings];
    }
    const uniqueFindings = [...new Map(findings.map((finding) => [finding.id, finding])).values()];
    return {
        name,
        commands: [command],
        exitCode: effectiveExitCode,
        durationMs,
        verdict: stageVerdict(name, effectiveExitCode, uniqueFindings),
        ...(testCounts ? { testCounts } : {}),
        ...(e2eTiming ? { e2eTiming } : {}),
        collected: countCollected(log, uniqueFindings, testCounts),
        findings: uniqueFindings,
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
    if (!STAGES.includes(name) || !logFile || !output || !Number.isInteger(exitCode))
        fail('stage requires --name, --exit-code, --log and --output');
    if (!Number.isInteger(durationMs) || durationMs < 0) fail('stage requires a non-negative integer --duration-ms');
    const stage = makeStage({
        name,
        command: args.command || name,
        exitCode,
        durationMs,
        log: readText(logFile),
        runDir: path.dirname(logFile),
        reportsDir: args['reports-dir'],
    });
    writeJson(output, stage);
    if (stage.exitCode !== 0) process.exit(stage.exitCode);
}

function reportCommand(args) {
    const tool = args.tool;
    const input = args.input;
    const output = args.output;
    const exitCode = Number(args['exit-code']);
    if (!REPORT_TOOLS.has(tool) || !input || !output || !Number.isInteger(exitCode))
        fail('report requires --tool, --input, --output and --exit-code');
    const report = parseReport(tool, input, exitCode);
    writeJson(output, report);
    process.stdout.write(formatReport(report));
    if (report.status !== 'available' && exitCode === 0) process.exit(3);
    if (exitCode !== 0) process.exit(exitCode);
}

function skippedCommand(args) {
    if (!STAGES.includes(args.name) || !args.output) fail('skipped requires --name and --output');
    const testCounts = args.name === 'e2e' ? { frontend: emptyTestCount('skipped') } : undefined;
    writeJson(args.output, {
        name: args.name,
        commands: [args.command || args.name],
        exitCode: 0,
        durationMs: 0,
        verdict: 'skipped',
        ...(testCounts ? { testCounts } : {}),
        collected: 0,
        findings: [],
    });
}

function stageFiles(runDir) {
    if (!fs.existsSync(runDir)) fail(`missing run directory: ${runDir}`);
    const stages = [];
    for (const name of STAGES) {
        const file = path.join(runDir, `${name}.json`);
        if (!fs.existsSync(file)) continue;
        let value;
        try {
            value = JSON.parse(readText(file));
        } catch {
            continue;
        }
        if (value.name === name) stages.push(value);
    }
    return stages;
}

function stageDisplayName(name) {
    if (name === 'e2e') return 'E2E';
    return name[0].toUpperCase() + name.slice(1);
}

function dottedLabel(label, width) {
    const dots = Math.max(1, width - label.length - 1);
    return `${label} ${'.'.repeat(dots)}`;
}

function formatTestCount(label, count) {
    const prefix = `  ${dottedLabel(stageDisplayName(label), 18)} `;
    if (!count) return `${prefix}UNAVAILABLE`;
    if (count.status === 'skipped') return `${prefix}SKIPPED`;
    if (count.status !== 'available') return `${prefix}${count.status.toUpperCase()}`;
    const todo = count.todo > 0 ? `, ${count.todo} todo` : '';
    return `${prefix}${count.total} total, ${count.passed} passed, ${count.failed} failed, ${count.skipped} skipped${todo}`;
}

function formatE2eTiming(timing) {
    const available = (value) => (value === null ? 'unavailable' : `${value} ms`);
    const lines = [
        `  E2E wall: ${available(timing.wallMs)}; preparation: ${available(timing.prepareMs)}`,
        `  E2E lifecycle (summed across concurrent tests): ${timing.starts ?? 'unavailable'} starts (${timing.relaunches ?? 'unavailable'} relaunches), launch total: ${available(timing.launchMs)}, teardown total: ${available(timing.teardownMs)}`,
        `  E2E relaunch inclusive total: ${available(timing.relaunchMs)}`,
        `  E2E outcomes: ${timing.failures ?? 'unavailable'} failures, ${timing.skipped ?? 'unavailable'} skips, ${timing.retries ?? 'unavailable'} retries`,
    ];
    for (const [label, entries] of [
        ['tests', timing.slowestTests],
        ['files', timing.slowestFiles],
    ]) {
        if (entries.length === 0) continue;
        lines.push(`  Slowest ${label} (summed inclusive durations):`);
        for (const entry of entries) {
            const title = entry.title ? ` › ${entry.title}` : '';
            lines.push(`    ${entry.durationMs} ms  ${entry.file}${title}`);
        }
    }
    return lines;
}

function summaryStageStatus(stage) {
    if (!stage) return 'notRun';
    if (stage.verdict === 'skipped') return 'skipped';
    return stage.exitCode === 0 ? 'passed' : 'failed';
}

function formatSummaryStage(name, stage, status) {
    const labels = { passed: 'PASS', failed: 'FAIL', skipped: 'SKIPPED', notRun: 'NOT RUN' };
    const skippedByFlag = status === 'skipped' && stage.commands?.some((command) => command.includes('--skip e2e'));
    const label = skippedByFlag ? 'SKIPPED (--skip e2e)' : labels[status];
    const lines = [`${dottedLabel(stageDisplayName(name), 19)} ${label}`];
    for (const group of TEST_GROUPS) {
        const count = stage?.testCounts?.[group];
        if (count) lines.push(formatTestCount(group, count));
    }
    if (name === 'e2e' && stage?.e2eTiming && status !== 'skipped') lines.push(...formatE2eTiming(stage.e2eTiming));
    return lines;
}

function formatSummary(summary, expectedStages = STAGES) {
    const byName = new Map(summary.stages.map((stage) => [stage.name, stage]));
    const lines = [`Run ${summary.runId}`];
    const counts = { passed: 0, failed: 0, skipped: 0, notRun: 0 };
    for (const name of expectedStages) {
        const stage = byName.get(name);
        const status = summaryStageStatus(stage);
        counts[status] += 1;
        const stageLines = formatSummaryStage(name, stage, status);
        if (lines.length > 1) stageLines.unshift('');
        lines.push(...stageLines);
    }

    const { passed, failed, skipped, notRun } = counts;
    const summaryParts = [`${passed} passed`, `${failed} failed`, `${skipped} skipped`];
    if (notRun) summaryParts.push(`${notRun} not run`);
    lines.push('', `Summary: ${summaryParts.join(', ')}`, `Duration: ${summary.durationMs} ms`);
    return `${lines.join('\n')}\n`;
}

function summaryCommand(args) {
    const stages = stageFiles(args['run-dir']);
    const expectedStages =
        !args.expected || args.expected === 'all'
            ? STAGES
            : args.expected.split(',').filter((name) => STAGES.includes(name));
    const durationMs = stages.reduce((total, stage) => total + stage.durationMs, 0);
    const exitCode = stages.find((stage) => stage.exitCode !== 0)?.exitCode ?? 0;
    const summary = {
        runId: path.basename(args['run-dir']),
        durationMs,
        exitCode,
        stages,
    };
    if (args.output) writeJson(args.output, summary);
    process.stdout.write(formatSummary(summary, expectedStages));
    if (exitCode !== 0) process.exit(exitCode);
}

function commandOutput(command, commandArgs, cwd = process.cwd()) {
    const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : 'unavailable';
}

function baselineCommand(args) {
    const output = args.output;
    const runDir = args['run-dir'];
    const feature = args.feature;
    if (
        ![output, runDir, feature, args.commit, args['diff-file'], args['status-file']].every(
            (value) => typeof value === 'string' && value,
        )
    )
        fail('baseline requires --feature, --run-dir, --output, --commit, --diff-file and --status-file');
    const commit = args.commit;
    if (!/^[0-9a-f]{40}$/.test(commit)) fail('baseline requires a full commit');
    const stages = stageFiles(runDir);
    if (stages.length !== STAGES.length) fail('baseline requires all six stage records');
    const unreliableCount = stages.flatMap((stage) =>
        Object.entries(stage.testCounts || {})
            .filter(([, count]) => !['available', 'skipped'].includes(count.status))
            .map(([group, count]) => `${stage.name}/${group} (${count.status})`),
    );
    if (stages.some((stage) => stage.verdict === 'unreliable') || unreliableCount.length > 0)
        fail(
            `baseline is unreliable; ${
                unreliableCount.length > 0
                    ? `test counts unavailable or unreliable: ${unreliableCount.join(', ')}`
                    : 'a stage exited non-zero without parseable findings'
            }`,
            3,
        );
    const diff = fs.readFileSync(args['diff-file']);
    const status = fs.readFileSync(args['status-file']).toString('utf8');
    const untrackedPaths = status
        .split('\0')
        .filter(Boolean)
        .filter((entry) => entry.startsWith('??'))
        .map((entry) => entry.slice(3));
    const frontendRoot = path.join(process.env.REPO_ROOT || process.cwd(), 'frontend');
    const tools = {
        go: commandOutput('go', ['version']),
        node: commandOutput('node', ['--version']),
        npm: commandOutput('npm', ['--version']),
        wails: commandOutput('wails', ['version']),
        golangciLint: commandOutput('golangci-lint', ['--version']),
        shfmt: commandOutput('shfmt', ['--version']),
        prettier: commandOutput(path.join(frontendRoot, 'node_modules/.bin/prettier'), ['--version']),
        playwright: commandOutput(path.join(frontendRoot, 'node_modules/.bin/playwright'), ['--version']),
    };
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
    if (record.schemaVersion !== 1 || !Array.isArray(record.stages) || record.stages.length !== 6)
        fail('baseline input is missing required fields');
    const current = new Map(stageFiles(runDir).map((stage) => [stage.name, stage]));
    let failed = false;
    for (const previous of record.stages) {
        const now = current.get(previous.name);
        if (!now) {
            console.log(`${previous.name}: findings remaining; current stage missing`);
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
        if (added.length || remaining.length || regressed || now.verdict === 'unreliable') failed = true;
    }
    if (failed) process.exit(1);
}

const [command] = process.argv.slice(2);
const args = parseArgs(process.argv.slice(3));
switch (command) {
    case 'stage':
        stageCommand(args);
        break;
    case 'report':
        reportCommand(args);
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
        fail('usage: results.mjs <report|stage|skipped|summary|baseline|compare> ...');
}
