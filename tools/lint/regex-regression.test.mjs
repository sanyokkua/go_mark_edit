import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'lint-regression-'));
    const write = (path, content) => {
        const file = join(root, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
    };
    for (const name of ['tokens.mjs', 'repo-rules.mjs', 'bundle-scan.mjs']) {
        mkdirSync(join(root, 'tools/lint'), { recursive: true });
        copyFileSync(resolve('tools/lint', name), join(root, 'tools/lint', name));
    }
    return { root, write };
}
function run(root, name, ...args) {
    return spawnSync(process.execPath, [join(root, 'tools/lint', name), ...args], {
        encoding: 'utf8',
        timeout: 3000,
    });
}

void test('token scanner handles long whitespace and preserves multiline declarations and comments', () => {
    const { root, write } = fixture();
    try {
        write('frontend/src/ui/styles/tokens.css', '\r\n  --used\r\n : red;\n--unused: blue;\n');
        write('frontend/src/main.css', 'var(--used);\n// var(--ignored)\r\n' + '\n'.repeat(80000) + 'x');
        write('frontend/public/empty.css', '');
        write('frontend/scripts/empty.js', '');
        const result = run(root, 'tokens.mjs');
        assert.equal(result.status, 1, result.error?.message ?? result.stderr);
        assert.match(result.stdout, /--unused is declared but never referenced/);
        assert.doesNotMatch(result.stdout, /--used\b|--ignored\b/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('token scanner handles unterminated block comment openers', () => {
    const { root, write } = fixture();
    try {
        write('frontend/src/ui/styles/tokens.css', '');
        write('frontend/src/main.css', '/*a'.repeat(100000));
        write('frontend/public/empty.css', '');
        write('frontend/scripts/empty.js', '');
        const result = run(root, 'tokens.mjs');
        assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('reference scan handles long punctuation without losing missing path findings', () => {
    const { root, write } = fixture();
    try {
        write('README.md', '`' + ','.repeat(100000) + 'x`\n`scripts/missing.sh),`\n');
        const result = run(root, 'repo-rules.mjs', '--root', root);
        assert.equal(result.status, 1, result.error?.message ?? result.stderr);
        assert.match(result.stdout, /missing referenced path scripts\/missing\.sh/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

void test('bundle scanner flags test names and directories without flagging similar names', () => {
    const { root, write } = fixture();
    try {
        for (const path of ['app.test.js', 'tests/file.js', 'dir/test/file.js', 'contest.js', 'latest.js']) {
            write('bundle/' + path, '');
        }
        const result = run(root, 'bundle-scan.mjs', join(root, 'bundle'));
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stdout, /app\.test\.js: test file/);
        assert.match(result.stdout, /tests\/file\.js: test file/);
        assert.match(result.stdout, /dir\/test\/file\.js: test file/);
        assert.doesNotMatch(result.stdout, /contest\.js|latest\.js/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
