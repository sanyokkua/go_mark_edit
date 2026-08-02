import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  createSettingsAdapter,
  type SettingsBindings,
} from '../../logic/adapter/services';
import { store } from '../../logic/store';
import { dismissNotification } from '../../logic/store/notificationsSlice';
import * as mockSettings from './go/settings/SettingsHandler';

const execFileAsync = promisify(execFile);

interface BridgeMockResolution {
  active: boolean;
  handler: string | null;
  runtime: string | null;
}

const viteConfigProbe = `
import path from 'node:path';
import { resolveConfig } from 'vite';

const mode = process.argv[1];
const config = await resolveConfig(
  { configFile: path.resolve(process.cwd(), 'vite.config.ts'), mode },
  'serve',
  mode,
);
const plugin = config.plugins.find(
  ({ name }) => name === 'vite-plugin-bridge-mock',
);
const resolveHook =
  typeof plugin?.resolveId === 'function'
    ? plugin.resolveId
    : plugin?.resolveId?.handler;

async function resolveId(id) {
  if (resolveHook === undefined) return null;
  const resolution = await resolveHook.call({}, id, undefined, {});
  if (typeof resolution === 'string') return resolution;
  return resolution?.id ?? null;
}

console.log(JSON.stringify({
  active: plugin !== undefined,
  handler: await resolveId('wailsjs/go/settings/SettingsHandler'),
  runtime: await resolveId('wailsjs/runtime'),
}));
`;

const viteTransformProbe = `
import path from 'node:path';
import { createServer } from 'vite';

const server = await createServer({
  configFile: path.resolve(process.cwd(), 'vite.config.ts'),
  mode: 'development',
});

try {
  const transformed = await server.transformRequest('/src/logic/adapter/index.ts');
  console.log(JSON.stringify(transformed?.code ?? null));
} finally {
  await server.close();
}
`;

async function inspectBridgeMock(mode: string): Promise<BridgeMockResolution> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', viteConfigProbe, mode],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  return JSON.parse(stdout.trim()) as BridgeMockResolution;
}

async function transformAdapterInMockMode(): Promise<string> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', viteTransformProbe],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const transformed = JSON.parse(stdout.trim()) as string | null;

  if (transformed === null) {
    throw new Error('Vite did not transform the app-model adapter.');
  }

  return transformed;
}

afterEach((): void => {
  for (const notification of store.getState().notifications.items) {
    store.dispatch(dismissNotification(notification.id));
  }
});

it('STORY-006-AC-4 serves adapter success and validation errors through the dev bridge mock', async () => {
  await expect(inspectBridgeMock('development')).resolves.toEqual({
    active: true,
    handler: resolve(
      process.cwd(),
      'src/dev/bridge-mock/go/settings/SettingsHandler.ts',
    ),
    runtime: resolve(process.cwd(), 'src/dev/bridge-mock/runtime/index.ts'),
  });
  await expect(inspectBridgeMock('wails')).resolves.toEqual({
    active: false,
    handler: null,
    runtime: null,
  });
  await expect(inspectBridgeMock('production')).resolves.toEqual({
    active: false,
    handler: null,
    runtime: null,
  });

  const adapter = createSettingsAdapter({
    getSettings:
      mockSettings.GetSettings as unknown as SettingsBindings['getSettings'],
    updateAppearance:
      mockSettings.UpdateAppearance as unknown as SettingsBindings['updateAppearance'],
    resetAppearance:
      mockSettings.ResetAppearance as unknown as SettingsBindings['resetAppearance'],
    updateContentPrivacy:
      mockSettings.UpdateContentPrivacy as unknown as SettingsBindings['updateContentPrivacy'],
    updateMarkdown:
      mockSettings.UpdateMarkdown as unknown as SettingsBindings['updateMarkdown'],
  });

  await expect(adapter.getSettings()).resolves.toMatchObject({
    appearance: {
      theme: 'material',
      mode: 'auto',
      defaultOpenMode: 'editor',
    },
    markdown: { standard: 'gfm' },
    contentPrivacy: { remotePolicy: 'ask' },
  });
  await expect(
    adapter.updateAppearance({
      theme: 'error',
      mode: 'auto',
      defaultOpenMode: 'edit',
    }),
  ).rejects.toMatchObject({
    code: 'validation',
    title: 'Invalid setting',
    message: 'The mock rejected this setting value.',
    retryable: false,
  });
});

it('STORY-018-AC-1 routes app-model adapter imports through the bridge mock in Vite development mode', async () => {
  const transformed = await transformAdapterInMockMode();

  expect(transformed).toContain(
    '/src/dev/bridge-mock/go/appmodel/AppModelHandler.ts',
  );
  expect(transformed).toContain('/src/dev/bridge-mock/runtime/index.ts');
  expect(transformed).not.toContain('/wailsjs/go/appmodel/AppModelHandler.js');
  expect(transformed).not.toContain('/wailsjs/runtime/runtime.js');
});
