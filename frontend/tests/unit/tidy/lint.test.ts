import { runOnText } from '../../../src/logic/tidy/engine';
import { splitIntoChunks } from '../../../src/logic/tidy/chunking';
import { applyEdits } from '../../../src/logic/tidy/edits';
import { lintFindings } from '../../../src/logic/tidy/lint';
import { parseFull } from '../../../src/logic/tidy/parser';
import type { TidyPreferences } from '../../../src/logic/tidy/prefs';
import type { LintFinding, LintRule } from '../../../src/logic/tidy/protocol';

const prefs: TidyPreferences = { bullet: '-', emphasis: '_', heading: 'atx' };

function lint(source: string, choices: TidyPreferences = prefs): LintFinding[] {
    const outcome = runOnText('lint', source, choices);
    expect(outcome.kind).toBe('findings');
    if (outcome.kind !== 'findings') throw new Error('Lint did not return findings');
    expect(outcome.total).toBe(outcome.findings.length);
    return outcome.findings;
}

function rule(source: string, name: LintRule, choices: TidyPreferences = prefs): LintFinding[] {
    return lint(source, choices).filter((finding) => finding.rule === name);
}

test('when a document follows every lint rule, Lint returns no findings', () => {
    expect(lint('# Title\n\n- one\n- two\n\n_clean_ and **bold**\n')).toEqual([]);
});

test('when unordered markers differ from the preference, Lint reports each mismatched item', () => {
    expect(rule('* one\n* two\n', 'ul-marker')).toHaveLength(2);
    expect(rule('- one\n', 'ul-marker', { ...prefs, bullet: '*' })).toHaveLength(1);
    expect(rule('- one\n', 'ul-marker')).toHaveLength(0);
});

test('when adjacent unordered lists alternate markers, Lint accepts the separating marker', () => {
    expect(rule('- one\n\n* two\n', 'ul-marker')).toHaveLength(0);
});

test('when emphasis or strong delimiters differ, Lint reports one finding per node', () => {
    expect(rule('*ordinary*\n', 'emphasis-marker')).toHaveLength(1);
    expect(rule('__strong__\n', 'strong-marker')).toHaveLength(1);
    expect(rule('_ordinary_\n', 'emphasis-marker')).toHaveLength(0);
    expect(rule('**strong**\n', 'strong-marker')).toHaveLength(0);
    expect(rule('_ordinary_\n', 'emphasis-marker', { ...prefs, emphasis: '*' })).toHaveLength(1);
    expect(rule('*ordinary*\n', 'emphasis-marker', { ...prefs, emphasis: '*' })).toHaveLength(0);
});

test('when emphasis is intraword or touches nested delimiters, Lint accepts the safe marker', () => {
    expect(rule('foo*bar*baz\n', 'emphasis-marker')).toHaveLength(0);
    expect(rule('*_nested_*\n', 'emphasis-marker')).toHaveLength(0);
});

test('when table cells contain other emphasis and strong markers, Lint exempts the cells but warns on prose', () => {
    const source = '| Name | Value |\n| --- | --- |\n| *cell* | __cell__ |\n\n*outside* __outside__\n';
    expect(rule(source, 'emphasis-marker')).toMatchObject([{ startLine: 5 }]);
    expect(rule(source, 'strong-marker')).toMatchObject([{ startLine: 5 }]);
});

test('when Format changes prose around a table, Lint accepts the untouched markers inside its cells', () => {
    const source = '| Name | Value |\n| --- | --- |\n| *cell* | __cell__ |\n\n*outside* __outside__\n';
    const outcome = runOnText('format', source, prefs);
    expect(outcome.kind).toBe('edits');
    if (outcome.kind !== 'edits') throw new Error('Format refused a safe table fixture');
    const formatted = applyEdits(source, outcome.edits);
    expect(formatted).toContain('| *cell*');
    expect(formatted).toContain('| __cell__');
    expect(formatted).toContain('_outside_ **outside**');
    expect(lint(formatted).filter((finding) => ['emphasis-marker', 'strong-marker'].includes(finding.rule))).toEqual(
        [],
    );
});

test('when heading style differs from a safely convertible preference, Lint reports it', () => {
    expect(rule('Title\n=====\n', 'heading-style')).toHaveLength(1);
    expect(rule('# Title\n', 'heading-style', { ...prefs, heading: 'setext' })).toHaveLength(1);
    expect(rule('### Title\n', 'heading-style', { ...prefs, heading: 'setext' })).toHaveLength(0);
    expect(rule('# Title\n', 'heading-style')).toHaveLength(0);
});

test('when Format cannot safely convert a heading, Lint exempts that heading', () => {
    expect(rule('first\nsecond\n======\n', 'heading-style')).toHaveLength(0);
    expect(rule('# * item\n', 'heading-style', { ...prefs, heading: 'setext' })).toHaveLength(0);
});

test('when list item marker starts differ, Lint reports the inconsistent item', () => {
    expect(rule('- one\n - two\n', 'list-indent')).toHaveLength(1);
    expect(rule('- one\n- two\n', 'list-indent')).toHaveLength(0);
});

test('when ordered markers align at their right edges, Lint accepts their varying starts', () => {
    expect(rule(' 9. one\n10. two\n', 'list-indent')).toHaveLength(0);
    expect(rule('  9. one\n 10. two\n11. three\n', 'list-indent')).toHaveLength(1);
});

test('when a second top-level heading appears, Lint reports each later heading', () => {
    expect(rule('# First\n\n# Second\n\n# Third\n', 'single-h1')).toHaveLength(2);
    expect(rule('# First\n\n## Second\n', 'single-h1')).toHaveLength(0);
});

test('when prose has trailing spaces or tabs, Lint reports each line but accepts hard breaks', () => {
    expect(rule('one \ntwo\t\nthree  \nfour\n', 'trailing-space')).toHaveLength(2);
    expect(rule('one  \ntwo\n', 'trailing-space')).toHaveLength(0);
});

test('when protected content has trailing spaces or blank lines, Lint does not report them', () => {
    const source = '---\ntitle: x  \n\n\n---\n\n```md\ncode  \n\n\n```\n\n$$\nx  \n\n\n$$\n\n<!-- raw  \n\n\n-->\n';
    expect(rule(source, 'trailing-space')).toHaveLength(0);
    expect(rule(source, 'blank-lines')).toHaveLength(0);
});

test('when blank lines occur in runs, Lint reports one finding for each run', () => {
    expect(rule('one\n\n\n\ntwo\n\n\nthree\n', 'blank-lines')).toHaveLength(2);
    expect(rule('one\n\ntwo\n', 'blank-lines')).toHaveLength(0);
});

test('when a fenced code block lacks a language, Lint reports it', () => {
    expect(rule('```\ncode\n```\n', 'fence-language')).toHaveLength(1);
    expect(rule('~~~md\ncode\n~~~\n', 'fence-language')).toHaveLength(0);
    expect(rule('    indented code\n', 'fence-language')).toHaveLength(0);
});

test('when a document lacks its final newline, Lint reports its final line', () => {
    expect(rule('word', 'final-newline')).toHaveLength(1);
    expect(rule('word\n', 'final-newline')).toHaveLength(0);
    expect(rule('', 'final-newline')).toMatchObject([{ startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 }]);
});

test('when Lint reports findings, severities, keys, and ranges are complete', () => {
    const findings = lint('* item  \n\n\n```\ncode\n```');
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
        expect(finding.severity).toBe(['trailing-space', 'final-newline'].includes(finding.rule) ? 'error' : 'warning');
        expect(finding.startLine).toBeGreaterThanOrEqual(1);
        expect(finding.startColumn).toBeGreaterThanOrEqual(1);
        expect(finding.endLine).toBeGreaterThanOrEqual(finding.startLine);
        expect(finding.endColumn).toBeGreaterThan(0);
        expect(finding.endLine > finding.startLine || finding.endColumn > finding.startColumn).toBe(true);
        expect(finding.message.key).toBe(`lint.rule.${finding.rule}.message`);
        expect(finding.hint).toBe(`lint.rule.${finding.rule}.hint`);
    }
    expect(findings.map((finding) => finding.startLine)).toEqual(
        [...findings.map((finding) => finding.startLine)].sort((a, b) => a - b),
    );
});

test.each([0, 1, 10, 1500, 12000])('when %i trailing spaces exist, Lint reports the exact count', (count) => {
    const source = count === 0 ? 'clean\n' : 'dirty \n'.repeat(count);
    const findings = rule(source, 'trailing-space');
    expect(findings).toHaveLength(count);
    expect(lint(source)).toHaveLength(count);
});

test('when a large document splits at a heading, Lint matches an unsplit Full parse at the boundary and EOF', () => {
    const source =
        '---\n# hidden\n---\n\n$$\n# hidden\n$$\n\n# One\n\n' + 'x'.repeat(256 * 1024) + '\n\n\n# Two\n\n* item ';
    expect(splitIntoChunks(source)).toHaveLength(3);
    const findings = lint(source);
    const whole = lintFindings(source, parseFull(source), prefs, { h1Count: 0 }, true);
    expect(findings).toEqual(whole);
    expect(findings.filter((finding) => finding.rule === 'single-h1')).toHaveLength(1);
    expect(findings.filter((finding) => finding.rule === 'blank-lines')).toHaveLength(1);
    expect(findings.filter((finding) => finding.rule === 'final-newline')).toHaveLength(1);
});

test('when Format succeeds, Lint reports only rules Format does not fix', () => {
    const source = '# One\n\n# Two\n\n* item\n\n*word* \n\n```\ncode\n```';
    const outcome = runOnText('format', source, prefs);
    expect(outcome.kind).toBe('edits');
    if (outcome.kind !== 'edits') throw new Error('Format refused a safe fixture');
    const formatted = applyEdits(source, outcome.edits);
    expect(lint(formatted).map((finding) => finding.rule)).toEqual(['single-h1', 'fence-language']);
});
