import { t } from '../../../src/i18n';
import {
  createShellActionCatalogue,
  dispatchShellAction,
} from '../../../src/logic/actions/shellActions';

function actionContext(modalOpen = false) {
  return {
    modalOpen,
    viewAvailable: true,
    openSettings: jest.fn(),
    openView: jest.fn(),
    openAbout: jest.fn(),
    toggleFullscreen: jest.fn(async (): Promise<boolean> => true),
  };
}

it('exposes one unique localized catalogue for every working shell action', async () => {
  const context = actionContext();
  const actions = createShellActionCatalogue(context);

  expect(actions.map((action) => action.id)).toEqual([
    'settings',
    'view',
    'about',
    'fullscreen',
  ]);
  expect(new Set(actions.map((action) => action.id)).size).toBe(actions.length);
  expect(
    new Set(
      actions.flatMap((action) =>
        action.shortcut === undefined ? [] : [action.shortcut],
      ),
    ).size,
  ).toBe(2);
  expect(actions.map((action) => action.scope)).toEqual([
    'application',
    'window',
    'application',
    'window',
  ]);
  for (const action of actions) {
    expect(t(action.labelKey)).not.toBe(action.labelKey);
    expect(t(action.accessibilityKey)).not.toBe(action.accessibilityKey);
    await expect(dispatchShellAction(action)).resolves.toBe(true);
  }

  expect(context.openSettings).toHaveBeenCalledTimes(1);
  expect(context.openView).toHaveBeenCalledTimes(1);
  expect(context.openAbout).toHaveBeenCalledTimes(1);
  expect(context.toggleFullscreen).toHaveBeenCalledTimes(1);
});

it('suppresses background actions while a modal is open', async () => {
  const context = actionContext(true);
  const actions = createShellActionCatalogue(context);

  for (const action of actions) {
    await expect(dispatchShellAction(action)).resolves.toBe(false);
  }
  expect(context.openSettings).not.toHaveBeenCalled();
  expect(context.openView).not.toHaveBeenCalled();
  expect(context.openAbout).not.toHaveBeenCalled();
  expect(context.toggleFullscreen).not.toHaveBeenCalled();
});

it('registers Toggle Sidebar for the scope-aware shortcut dispatcher', async () => {
  const toggleSidebar = jest.fn();
  const context = { ...actionContext(), toggleSidebar };
  const actions = createShellActionCatalogue(context);
  const action = actions.find((candidate) => candidate.id === 'toggle-sidebar');

  expect(action).toMatchObject({
    id: 'toggle-sidebar',
    scope: 'window',
    shortcut: 'Mod+\\',
  });
  await expect(dispatchShellAction(action!)).resolves.toBe(true);
  expect(toggleSidebar).toHaveBeenCalledTimes(1);
});

it('includes the registry-owned Settings binding in shell dispatch', () => {
  const context = actionContext();
  const settings = createShellActionCatalogue(context).find(
    (action) => action.id === 'settings',
  );

  expect(settings).toMatchObject({
    id: 'settings',
    shortcut: 'Mod+,',
  });
});
