// Frontend architecture gate. Two checks, both from docs/delivery/architecture/rules.md:
//
//   #only-the-adapter-imports-wailsjs   ]  via eslint.architecture.config.js
//   #strings-go-through-t               ]
//   #no-colour-outside-a-token             a scan of frontend/src/ui/**
//
// Existing violations are allowed by count, from archtest-allowlist.json, and anything new fails.
// That is what lets the gate be green today and still bite tomorrow — an absolute "zero findings" on
// a repository with a history is a gate that gets turned off.
//
// Run it with `just archtest`. Exits non-zero on any violation that is not allowed.

import { ESLint } from 'eslint';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProductionNetworkGuard } from './check-production-network.mjs';

const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
const allowlistPath = join(frontendRoot, 'scripts', 'archtest-allowlist.json');

let failures = 0;
const note = (message) => process.stdout.write(`${message}\n`);
const fail = (message) => {
  failures += 1;
  process.stdout.write(`  FAIL  ${message}\n`);
};

// ---------------------------------------------------------------- boundaries, via eslint

async function runBoundaryLint(allowlist) {
  const eslint = new ESLint({
    overrideConfigFile: join(frontendRoot, 'eslint.architecture.config.js'),
    cwd: frontendRoot,
  });
  const results = await eslint.lintFiles(['src/**/*.{ts,tsx}']);

  const counts = new Map();
  for (const result of results) {
    if (result.messages.length === 0) continue;
    const file = relative(frontendRoot, result.filePath);
    counts.set(file, result.messages.length);
    for (const message of result.messages) {
      const location = `${file}:${message.line}:${message.column}`;
      process.stdout.write(`        ${location}  ${message.message}\n`);
    }
  }

  for (const [file, count] of counts) {
    const allowed = allowlist.strings[file] ?? 0;
    if (count > allowed) {
      fail(
        `${file}: ${count} boundary violation(s), ${allowed} allowed. ` +
          `A new one must be fixed, not added to scripts/archtest-allowlist.json.`,
      );
    } else {
      note(`  allowed  ${file}: ${count} known violation(s)`);
    }
  }
  for (const [file, allowed] of Object.entries(allowlist.strings)) {
    if (!counts.has(file) && allowed > 0) {
      note(
        `  stale    ${file}: allowlist reserves ${allowed}, none found — lower it in scripts/archtest-allowlist.json`,
      );
    }
  }
}

// ---------------------------------------------------------------- colour literals, by scan

// A hex colour, or a functional colour notation. `transparent`, `inherit` and `currentColor` are not
// colours that vary by theme, so they are permitted.
const HEX = /(^|[^\w&])#[0-9a-fA-F]{3,8}\b/;
const FUNCTIONAL = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/;
const KEYWORD_IN_CSS_VALUE =
  /:\s*[^;]*\b(white|black|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|gold|beige|ivory|coral|salmon|khaki|indigo|violet|crimson|tomato|orchid|plum|tan|wheat)\b/;

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

async function runColourScan(allowlist) {
  const uiRoot = join(frontendRoot, 'src', 'ui');
  const counts = new Map();

  for await (const path of walk(uiRoot)) {
    if (!/\.(css|ts|tsx)$/.test(path)) continue;
    const file = relative(frontendRoot, path);
    if (file.endsWith('src/ui/styles/tokens.css')) continue; // the one place colours live
    if (/\.test\.tsx?$/.test(file)) continue;

    const isCss = file.endsWith('.css');
    const lines = (await readFile(path, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
      )
        return;
      const hit =
        HEX.test(line) ||
        FUNCTIONAL.test(line) ||
        (isCss && KEYWORD_IN_CSS_VALUE.test(line));
      if (!hit) return;
      counts.set(file, (counts.get(file) ?? 0) + 1);
      process.stdout.write(`        ${file}:${index + 1}  ${trimmed}\n`);
    });
  }

  for (const [file, count] of counts) {
    const allowed = allowlist.colours[file] ?? 0;
    if (count > allowed) {
      fail(
        `${file}: ${count} colour literal(s) outside tokens.css, ${allowed} allowed. ` +
          `Add a token in src/ui/styles/tokens.css and read it with var().`,
      );
    } else {
      note(`  allowed  ${file}: ${count} known colour literal(s)`);
    }
  }
}

// ---------------------------------------------------------------- parity route branches

/*
 * FR-FT-054 lets the `?parity-case` route seed a fixture and hold capture
 * conditions fixed. It does not let a production component render different
 * markup, different content, or a different component on that route — a harness
 * that measures a substituted component measures nothing that ships.
 *
 * T173 swept ten such branches out of `src/ui/**`. Two are kept deliberately and
 * are allowed by count below; each carries a comment at its site saying why it
 * cannot move to the mock backend or to a reference variant. `src/dev/bridge-mock/**`
 * is not scanned at all: it is the sanctioned home for fixture seeds, which is
 * where `refuseSave`, `refuseActivate` and `refuseCloseExecute` live.
 *
 * The allowance is a decreasing budget, like the colour scan above. Lower a
 * number when a branch leaves; never raise one to make a new branch land.
 */
const PARITY_ROUTE = /parity-case/;

async function runParityRouteScan(allowlist) {
  // The whole of src/, not just src/ui/: App.tsx is a production component too,
  // and it carried two of the ten branches T173 swept.
  const sourceRoot = join(frontendRoot, 'src');
  const counts = new Map();

  for await (const path of walk(sourceRoot)) {
    if (!/\.(ts|tsx)$/.test(path)) continue;
    const file = relative(frontendRoot, path);
    if (/\.test\.tsx?$/.test(file)) continue;
    if (file.startsWith('src/dev/')) continue; // the sanctioned fixture-seed home

    const lines = (await readFile(path, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
      )
        return;
      if (!PARITY_ROUTE.test(line)) return;
      counts.set(file, (counts.get(file) ?? 0) + 1);
      process.stdout.write(`        ${file}:${index + 1}  ${trimmed}\n`);
    });
  }

  for (const [file, count] of counts) {
    const allowed = allowlist.parityRoutes?.[file] ?? 0;
    if (count > allowed) {
      fail(
        `${file}: ${count} \`?parity-case\` branch(es) in a production component, ${allowed} allowed. ` +
          `Seed the fixture in src/dev/bridge-mock/, or express the difference on the reference ` +
          `side as an FR-FT-056 variant. See T173.`,
      );
    } else {
      note(`  allowed  ${file}: ${count} known parity-route branch(es)`);
    }
  }
}

// ---------------------------------------------------------------- offline production sources

async function runProductionNetworkScan() {
  const findings = await runProductionNetworkGuard({
    sourceRoots: [
      join(frontendRoot, 'src'),
      join(frontendRoot, 'public'),
      join(frontendRoot, 'wailsjs', 'go'),
    ],
    bundleRoots: [],
    requireBundle: false,
  });

  for (const finding of findings) {
    fail(
      `prohibited network path ${relative(frontendRoot, finding.path)}:${finding.line}`,
    );
  }
}

// ----------------------------------------------------------------

const allowlist = JSON.parse(await readFile(allowlistPath, 'utf8'));

note('archtest (frontend) — boundaries');
await runBoundaryLint(allowlist);
note('archtest (frontend) — colour literals');
await runColourScan(allowlist);
note('archtest (frontend) — parity route branches');
await runParityRouteScan(allowlist);
note('archtest (frontend) — offline production sources');
await runProductionNetworkScan();

if (failures > 0) {
  process.stdout.write(`\narchtest (frontend): ${failures} failing check(s)\n`);
  process.exit(1);
}
process.stdout.write('\narchtest (frontend): ok\n');
