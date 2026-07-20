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

async function inspectBridgeMock(mode: string): Promise<BridgeMockResolution> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', viteConfigProbe, mode],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  return JSON.parse(stdout.trim()) as BridgeMockResolution;
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
