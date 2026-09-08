import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const evidenceDir = fileURLToPath(new URL('.', import.meta.url));
const frontendDir = path.resolve(evidenceDir, '..');
const scenario = process.env.NATIVE_EVIDENCE_SCENARIO;

if (scenario === undefined || scenario.length === 0) {
  throw new Error(
    'NATIVE_EVIDENCE_SCENARIO is required for an evidence build.',
  );
}

export default defineConfig({
  base: './',
  root: evidenceDir,
  publicDir: path.resolve(frontendDir, 'public'),
  plugins: [react()],
  define: {
    __NATIVE_EVIDENCE_SCENARIO__: JSON.stringify(scenario),
  },
  resolve: {
    alias: {
      wailsjs: path.resolve(frontendDir, 'wailsjs'),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: path.resolve(frontendDir, 'dist-native-evidence', scenario),
  },
  worker: {
    format: 'es',
  },
});
