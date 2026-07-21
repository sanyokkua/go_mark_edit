import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

function bridgeMockPlugin(): Plugin {
  return {
    name: 'vite-plugin-bridge-mock',
    enforce: 'pre',
    resolveId(id: string): string | undefined {
      const handler = id.match(/^wailsjs\/go\/([^/]+)\/([^/]+)$/);
      if (handler !== null) {
        return path.resolve(
          rootDir,
          `src/dev/bridge-mock/go/${handler[1]}/${handler[2]}.ts`,
        );
      }

      if (id === 'wailsjs/runtime') {
        return path.resolve(rootDir, 'src/dev/bridge-mock/runtime/index.ts');
      }

      return undefined;
    },
  };
}

export default defineConfig(({ mode }) => {
  const isMockMode = mode !== 'wails' && mode !== 'production';

  return {
    plugins: [react(), ...(isMockMode ? [bridgeMockPlugin()] : [])],
    resolve: {
      alias: {
        wailsjs: path.resolve(rootDir, 'wailsjs'),
      },
    },
    worker: {
      format: 'es',
    },
  };
});
