import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

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

export default defineConfig({
  base: './',
  plugins: [previewImageBackendRoutePlugin(), react()],
  resolve: {
    alias: {
      wailsjs: path.resolve(rootDir, 'wailsjs'),
    },
  },
  worker: {
    format: 'es',
  },
});
