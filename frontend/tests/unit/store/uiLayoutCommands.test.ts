import type { UILayout } from '../../../src/logic/store/appModelTypes';

const mockSetUILayout = jest.fn<Promise<void>, [UILayout]>(
  async (): Promise<void> => undefined,
);

jest.mock('../../../src/logic/adapter', () => ({
  appModelAdapter: {
    setUILayout: mockSetUILayout,
  },
}));

import {
  WORKSPACE_BINDING_WIDTH,
  setWorkspaceVisible,
  setWorkspaceWidth,
} from '../../../src/logic/store/uiLayoutCommands';
import {
  hydrateProjection,
  resetProjection,
} from '../../../src/logic/store/appModelProjectionActions';
import { store } from '../../../src/logic/store/index';

function hydrateLayout(layout: UILayout): void {
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: {},
      activeDocumentId: null,
      ui: layout,
    }),
  );
}

beforeEach((): void => {
  store.dispatch(resetProjection());
  mockSetUILayout.mockClear();
});

afterEach((): void => {
  store.dispatch(resetProjection());
});

/*
 * A divider dragged to the left edge is a request to put the workspace away,
 * not a request for a workspace nobody can see. Sending width 0 on its own left
 * the shell reporting a visible pane at zero width, which is indistinguishable
 * from the control being broken.
 */
it('collapsing the divider to zero hides the workspace', async () => {
  hydrateLayout({ sidebarVisible: true, sidebarWidth: 240 });

  await store.dispatch(setWorkspaceWidth(0)).unwrap();

  expect(mockSetUILayout).toHaveBeenCalledTimes(1);
  expect(mockSetUILayout).toHaveBeenCalledWith({
    sidebarVisible: false,
    sidebarWidth: 0,
  });
});

it('an ordinary drag width carries no visibility change', async () => {
  hydrateLayout({ sidebarVisible: true, sidebarWidth: 240 });

  await store.dispatch(setWorkspaceWidth(288)).unwrap();

  expect(mockSetUILayout).toHaveBeenCalledWith({ sidebarWidth: 288 });
});

/*
 * The other half of the same decision: a workspace put away at zero comes back
 * at the binding's width, because "show it" has to produce something visible.
 */
it('showing a zero-width workspace restores the binding width', async () => {
  hydrateLayout({ sidebarVisible: false, sidebarWidth: 0 });

  await store.dispatch(setWorkspaceVisible(true)).unwrap();

  expect(mockSetUILayout).toHaveBeenCalledWith({
    sidebarVisible: true,
    sidebarWidth: WORKSPACE_BINDING_WIDTH,
  });
  expect(WORKSPACE_BINDING_WIDTH).toBe(216);
});

it('showing a workspace that already has a width leaves it alone', async () => {
  hydrateLayout({ sidebarVisible: false, sidebarWidth: 255 });

  await store.dispatch(setWorkspaceVisible(true)).unwrap();

  expect(mockSetUILayout).toHaveBeenCalledWith({ sidebarVisible: true });
});

it('hiding the workspace never rewrites its width', async () => {
  hydrateLayout({ sidebarVisible: true, sidebarWidth: 255 });

  await store.dispatch(setWorkspaceVisible(false)).unwrap();

  expect(mockSetUILayout).toHaveBeenCalledWith({ sidebarVisible: false });
});

/*
 * A workspace that has never been sized has no acknowledged width at all. The
 * shell already renders that case at the binding width through its own
 * fallback, so the command must not manufacture a write for it.
 */
it('showing a never-sized workspace issues no width', async () => {
  hydrateLayout({ sidebarVisible: false });

  await store.dispatch(setWorkspaceVisible(true)).unwrap();

  expect(mockSetUILayout).toHaveBeenCalledWith({ sidebarVisible: true });
});
