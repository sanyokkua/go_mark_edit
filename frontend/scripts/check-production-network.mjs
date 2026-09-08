import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SCANNED_FILE = /\.(?:css|html|js|jsx|mjs|ts|tsx)$/;
const PROHIBITED_NETWORK = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\b(?:navigator\.)?sendBeacon\s*\(/,
  /\b(?:telemetry|analytics)\s*\.\s*(?:capture|identify|init|send|track)\s*\(/i,
  /\b(?:crash(?:\s|-)?upload|update(?:\s|-)?check)\s*\(/i,
];
const REMOTE_ASSET =
  /(?:paths\s*:\s*\{\s*vs\s*:|\.src\s*=|\bsrc\s*:|url\s*\()[^\n]*https?:\/\//i;
const MONACO_CDN_FALLBACK =
  /paths\s*:\s*\{\s*vs\s*:\s*["']https:\/\/cdn\.jsdelivr\.net\/npm\/monaco-editor@[^"']+["']/i;
const VITE_PRELOAD_FETCH = /fetch\(\s*\w+\.href\s*,\s*\w+\s*\)/;

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (
      SCANNED_FILE.test(entry.name) &&
      !entry.name.includes('.test.')
    ) {
      yield path;
    }
  }
}

async function hasBundledMonacoInjection(sourceRoots) {
  for (const root of sourceRoots) {
    const path = resolve(root, 'ui', 'components', 'CodeEditor.tsx');
    try {
      const source = await readFile(path, 'utf8');
      const configuration = source.indexOf('monacoReact.loader.config');
      return (
        configuration > source.indexOf("import('./monacoSetup')") &&
        configuration <
          source.indexOf('return { default: monacoReact.default };')
      );
    } catch {
      // Fixture roots do not contain the application editor.
    }
  }
  return false;
}

async function hasRelativeViteBase(sourceRoots) {
  for (const root of sourceRoots) {
    try {
      const source = await readFile(
        resolve(root, '..', 'vite.config.ts'),
        'utf8',
      );
      if (source.includes("base: './'")) return true;
    } catch {
      // Fixture roots do not have a Vite configuration.
    }
  }
  return false;
}

export async function findProhibitedNetworkPaths(roots, safeguards) {
  const findings = [];

  for (const root of roots) {
    for await (const path of walk(root)) {
      const lines = (await readFile(path, 'utf8')).split('\n');
      lines.forEach((line, index) => {
        const isBundle = safeguards.bundleRoots.includes(root);
        const safeBundledMonacoFallback =
          isBundle &&
          safeguards.bundledMonacoInjection &&
          MONACO_CDN_FALLBACK.test(line);
        const safeVitePreload =
          isBundle &&
          safeguards.relativeViteBase &&
          VITE_PRELOAD_FETCH.test(line);
        const hasProhibitedApi = PROHIBITED_NETWORK.some((pattern) =>
          pattern.test(line),
        );
        // A built vendor chunk can contain documentation and default-configuration
        // strings. Only an executable request API there can make an outbound request.
        // Source and static assets remain subject to the remote-asset rule.
        const hasRemoteAsset = !isBundle && REMOTE_ASSET.test(line);
        if (
          (!hasProhibitedApi || safeVitePreload) &&
          (!hasRemoteAsset || safeBundledMonacoFallback)
        )
          return;
        findings.push({ path, line: index + 1, source: line.trim() });
      });
    }
  }

  return findings;
}

export async function runProductionNetworkGuard({
  sourceRoots,
  bundleRoots,
  requireBundle,
}) {
  const safeguards = {
    bundleRoots,
    bundledMonacoInjection: await hasBundledMonacoInjection(sourceRoots),
    relativeViteBase: await hasRelativeViteBase(sourceRoots),
  };
  const sourceFindings = await findProhibitedNetworkPaths(
    sourceRoots,
    safeguards,
  );
  const bundleFindings = await findProhibitedNetworkPaths(
    bundleRoots,
    safeguards,
  );
  const findings = [...sourceFindings, ...bundleFindings];

  if (requireBundle && bundleFindings.length === 0) {
    let hasBundleFile = false;
    for (const root of bundleRoots) {
      for await (const bundlePath of walk(root)) {
        if (bundlePath !== undefined) {
          hasBundleFile = true;
          break;
        }
      }
    }
    if (!hasBundleFile) {
      findings.push({
        path: bundleRoots.join(', '),
        line: 0,
        source: 'no built bundle was available to scan',
      });
    }
  }

  return findings;
}

function parseArguments(argumentsList) {
  const sourceRoots = [];
  const bundleRoots = [];
  let requireBundle = false;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--source-root') sourceRoots.push(argumentsList[++index]);
    if (argument === '--bundle-root') bundleRoots.push(argumentsList[++index]);
    if (argument === '--require-bundle') requireBundle = true;
  }

  return { sourceRoots, bundleRoots, requireBundle };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argumentsList = parseArguments(process.argv.slice(2));
  const findings = await runProductionNetworkGuard(argumentsList);

  if (findings.length > 0) {
    for (const finding of findings) {
      process.stdout.write(
        `  FAIL  prohibited network path ${finding.path}:${finding.line}  ${finding.source}\n`,
      );
    }
    process.exit(1);
  }

  process.stdout.write('production network guard: ok\n');
}
