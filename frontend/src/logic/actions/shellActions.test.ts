import { t } from '../../i18n';
import {
  createShellActionCatalogue,
  dispatchShellAction,
} from './shellActions';

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

it('FR-WS-014 exposes one unique localized catalogue for every working shell action', async () => {
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
  ).toBe(1);
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

it('FR-WS-014 suppresses background actions while a modal is open', async () => {
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
