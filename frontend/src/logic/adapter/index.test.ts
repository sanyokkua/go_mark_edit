import { store } from '../store';
import { dismissNotification } from '../store/notificationsSlice';
import type { WireError } from '../utils/parseError';
import { guardArity } from './bridgeGuard';
import { unwrap } from './envelope';
import { createSettingsAdapter, type SettingsBindings } from './services';

type SettingsResult = Awaited<ReturnType<SettingsBindings['getSettings']>>;
type VoidResult = Awaited<ReturnType<SettingsBindings['updateAppearance']>>;

const settings = {
  appearance: {
    theme: 'material',
    mode: 'auto',
    defaultOpenMode: 'edit',
  },
  markdown: {
    standard: 'gfm',
    formatOnSave: false,
    lintOnSave: false,
    bulletMarker: '-',
    emphasisMarker: '*',
    headingStyle: 'atx',
  },
  contentPrivacy: {
    remotePolicy: 'ask',
  },
};

afterEach((): void => {
  for (const notification of store.getState().notifications.items) {
    store.dispatch(dismissNotification(notification.id));
  }
});

it('STORY-006-AC-1 guards and unwraps every settings call', async () => {
  const calls: string[] = [];
  const result = { data: settings } as SettingsResult;
  const voidResult = {} as VoidResult;
  const bindings: SettingsBindings = {
    getSettings(): Promise<SettingsResult> {
      calls.push('get');
      return Promise.resolve(result);
    },
    updateAppearance(nextAppearance): Promise<VoidResult> {
      calls.push(`appearance:${nextAppearance.theme}`);
      return Promise.resolve(voidResult);
    },
    updateContentPrivacy(nextContentPrivacy): Promise<VoidResult> {
      calls.push(`privacy:${nextContentPrivacy.remotePolicy}`);
      return Promise.resolve(voidResult);
    },
    updateMarkdown(nextMarkdown): Promise<VoidResult> {
      calls.push(`markdown:${nextMarkdown.standard}`);
      return Promise.resolve(voidResult);
    },
  };
  const adapter = createSettingsAdapter(bindings);

  await expect(adapter.getSettings()).resolves.toBe(settings);
  await expect(
    adapter.updateAppearance({
      theme: 'dark',
      mode: 'dark',
      defaultOpenMode: 'view',
    }),
  ).resolves.toBeUndefined();
  await expect(adapter.updateContentPrivacy({ remotePolicy: 'block' })).resolves.toBeUndefined();
  await expect(
    adapter.updateMarkdown({
      standard: 'commonmark',
      formatOnSave: true,
      lintOnSave: true,
      bulletMarker: '*',
      emphasisMarker: '_',
      headingStyle: 'setext',
    }),
  ).resolves.toBeUndefined();

  await expect(
    Reflect.apply(
      guardArity('SettingsHandler.UpdateAppearance', bindings.updateAppearance),
      undefined,
      [],
    ) as Promise<void>,
  ).rejects.toThrow('SettingsHandler.UpdateAppearance expects 1 argument(s), received 0.');
  await expect(
    Reflect.apply(
      guardArity(
        'SettingsHandler.UpdateContentPrivacy',
        bindings.updateContentPrivacy,
      ),
      undefined,
      [],
    ) as Promise<void>,
  ).rejects.toThrow(
    'SettingsHandler.UpdateContentPrivacy expects 1 argument(s), received 0.',
  );
  await expect(
    Reflect.apply(
      guardArity('SettingsHandler.UpdateMarkdown', bindings.updateMarkdown),
      undefined,
      [],
    ) as Promise<void>,
  ).rejects.toThrow('SettingsHandler.UpdateMarkdown expects 1 argument(s), received 0.');
  expect(calls).toEqual(['get', 'appearance:dark', 'privacy:block', 'markdown:commonmark']);
});

it('STORY-006-AC-3 notifies exactly once before throwing the same wire error', () => {
  const wireError: WireError = {
    code: 'validation',
    title: 'Invalid setting',
    message: 'Choose a supported theme.',
    retryable: false,
  };
  let stateChanges = 0;
  const unsubscribe = store.subscribe((): void => {
    stateChanges += 1;
  });
  let thrown: unknown;

  try {
    unwrap({ error: wireError });
  } catch (error) {
    thrown = error;
  } finally {
    unsubscribe();
  }

  expect(thrown).toBe(wireError);
  expect(stateChanges).toBe(1);
  expect(store.getState().notifications.items).toEqual([
    expect.objectContaining({ error: wireError }),
  ]);
});
