import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(evidenceDir, '../..');
const boundaries = JSON.parse(
  fs.readFileSync(path.join(evidenceDir, 'boundaries.json'), 'utf8'),
);
const goDriver = fs.readFileSync(
  path.join(repositoryRoot, 'cmd/native-evidence/main_native_evidence.go'),
  'utf8',
);
const frontendDriver = fs.readFileSync(
  path.join(evidenceDir, 'main.tsx'),
  'utf8',
);

const approvedWailsImportDirectories = [
  path.join(repositoryRoot, 'frontend/src/logic/adapter'),
  path.join(repositoryRoot, 'frontend/src/dev/bridge-mock'),
];

function frontendSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        ['dist', 'dist-native-evidence', 'node_modules', 'wailsjs'].includes(
          entry.name,
        )
      ) {
        return [];
      }
      return frontendSourceFiles(entryPath);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function directWailsImports(source) {
  return [
    ...source.matchAll(
      /\b(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?['"](wailsjs\/[^'"]+)['"]|\bimport\s*\(\s*['"](wailsjs\/[^'"]+)['"]\s*\)/g,
    ),
  ].map((match) => match[1] ?? match[2]);
}

for (const sourcePath of frontendSourceFiles(
  path.join(repositoryRoot, 'frontend'),
)) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const imports = directWailsImports(source);
  if (
    imports.length > 0 &&
    !approvedWailsImportDirectories.some((directory) =>
      sourcePath.startsWith(`${directory}${path.sep}`),
    )
  ) {
    throw new Error(
      `${path.relative(repositoryRoot, sourcePath)} imports ${imports.join(', ')} outside the adapter or development-mock boundary`,
    );
  }
}
fs.writeSync(1, 'frontend Wails import boundaries: PASS\n');

const evidenceRuntimePath = path.join(
  repositoryRoot,
  'frontend/src/logic/adapter/nativeEvidenceRuntime.ts',
);
const evidenceRuntimeSource = fs.readFileSync(evidenceRuntimePath, 'utf8');
if (
  !directWailsImports(evidenceRuntimeSource).includes('wailsjs/runtime') ||
  !evidenceRuntimeSource.includes('LogInfo') ||
  !evidenceRuntimeSource.includes('Quit') ||
  !evidenceRuntimeSource.includes('EventsEmit') ||
  !evidenceRuntimeSource.includes('EventsOn')
) {
  throw new Error(
    'Native evidence runtime seam does not own LogInfo and Quit.',
  );
}
const evidenceRuntimeImporters = frontendSourceFiles(
  path.join(repositoryRoot, 'frontend'),
).filter(
  (sourcePath) =>
    sourcePath !== evidenceRuntimePath &&
    /from ['"][^'"]*nativeEvidenceRuntime['"]/.test(
      fs.readFileSync(sourcePath, 'utf8'),
    ),
);
if (
  evidenceRuntimeImporters.length !== 1 ||
  evidenceRuntimeImporters[0] !== path.join(evidenceDir, 'main.tsx')
) {
  throw new Error(
    `Native evidence runtime seam leaks into the ordinary release graph through ${evidenceRuntimeImporters.map((sourcePath) => path.relative(repositoryRoot, sourcePath)).join(', ')}`,
  );
}
fs.writeSync(1, 'native evidence runtime release exclusion: PASS\n');

const internalImports = [
  ...goDriver.matchAll(
    /"github\.com\/sanyokkua\/go_mark_edit\/internal\/([^"]+)"/g,
  ),
].map((match) => match[1]);
for (const imported of internalImports) {
  if (!['apperr', 'application', 'appmodel', 'file'].includes(imported)) {
    throw new Error(
      `Go driver bypasses the approved dependency boundaries through internal/${imported}`,
    );
  }
}

const frontendImports = [
  ...frontendDriver.matchAll(/from ['"]([^'"]+)['"]/g),
].map((match) => match[1]);
for (const imported of frontendImports) {
  if (
    imported.startsWith('../src/') &&
    ![
      '../src/App',
      '../src/logic/adapter',
      '../src/logic/adapter/nativeEvidenceRuntime',
      '../src/logic/store',
      '../src/logic/store/notificationsSlice',
    ].includes(imported)
  ) {
    throw new Error(
      `Frontend driver bypasses an approved dependency boundary through ${imported}`,
    );
  }
}

if (/EvidenceHandler|NativeEvidenceHandler/.test(goDriver)) {
  throw new Error(
    'Go driver introduces an evidence-only Wails handler instead of an existing boundary.',
  );
}

if (!goDriver.startsWith('//go:build native_evidence\n')) {
  throw new Error(
    'Go driver is not guarded by the dedicated native_evidence build tag.',
  );
}

for (const prohibited of [
  'EvidenceHandler',
  'NativeEvidenceHandler',
  'VITE_NATIVE_EVIDENCE_SCENARIO',
]) {
  const releaseSources = [
    path.join(repositoryRoot, 'main.go'),
    path.join(repositoryRoot, 'frontend/src/App.tsx'),
    path.join(repositoryRoot, 'frontend/src/logic/adapter/index.ts'),
  ];
  for (const source of releaseSources) {
    if (fs.readFileSync(source, 'utf8').includes(prohibited)) {
      throw new Error(
        `${path.relative(repositoryRoot, source)} exposes ${prohibited}`,
      );
    }
  }
}

const requiredEvidence = {
  'pending-close': ['driveSeparator', 'nativeEvidenceRuntime.quit'],
  'stale-close-old': ['driveSeparator', 'nativeEvidenceRuntime.quit'],
  'stale-close-new': ['driveSeparator', 'nativeEvidenceRuntime.quit'],
  'startup-retry': ['nativeEvidencePaths', 'ApplicationHandler'],
  'divider-acknowledgement': ['driveSeparator', 'appModelAdapter.getState'],
  notifications: ['notifyToast', 'notifyCondition', 'dismissNotification'],
  'autosave-latency': [
    'acknowledgeAutosaveInput',
    'onAutosaveCommit',
    'appModelAdapter.updateBuffer',
  ],
  'explicit-save-latency': [
    'newExplicitSaveLatencyScenario',
    'SetDocumentSaveDialog',
    'SetWriteCommitObserver',
  ],
};

for (const [scenario, expectedBoundaries] of Object.entries(boundaries)) {
  if (!Object.hasOwn(requiredEvidence, scenario)) {
    throw new Error(`Unexpected scenario ${scenario}`);
  }
  if (!Array.isArray(expectedBoundaries) || expectedBoundaries.length === 0) {
    throw new Error(`${scenario} has no existing dependency boundary`);
  }
  const combinedDriver = `${goDriver}\n${frontendDriver}`;
  for (const signal of requiredEvidence[scenario]) {
    if (!combinedDriver.includes(signal)) {
      throw new Error(`${scenario} does not exercise ${signal}`);
    }
  }
  fs.writeSync(1, `${scenario}: PASS (${expectedBoundaries.join(' -> ')})\n`);
}
