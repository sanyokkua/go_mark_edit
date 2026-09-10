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

      if (id === 'wailsjs/go/models') {
        return path.resolve(rootDir, 'wailsjs/go/models.ts');
      }

      return undefined;
    },
  };
}

function previewImageBackendRoutePlugin(): Plugin {
  return {
    name: 'preview-image-backend-route',
    configureServer(server): void {
      server.middlewares.use((request, response, next): void => {
        const path = request.url?.split('?', 1)[0];
        if (path !== '/preview-image') {
          next();
          return;
        }
        response.statusCode = 404;
        response.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isMockMode = mode !== 'wails' && mode !== 'production';

  return {
    base: './',
    plugins: [
      previewImageBackendRoutePlugin(),
      react(),
      ...(isMockMode ? [bridgeMockPlugin()] : []),
    ],
    resolve: {
      alias: isMockMode
        ? {}
        : {
            wailsjs: path.resolve(rootDir, 'wailsjs'),
          },
    },
    worker: {
      format: 'es',
    },
  };
});
