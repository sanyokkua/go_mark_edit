import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import {
  hydrateProjection,
  resetProjection,
} from '../../src/logic/store/appModelProjectionActions';
import type { UILayout } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import AppShell from '../../src/ui/widgets/AppShell';

jest.mock('../../src/logic/adapter', () => ({
  appModelAdapter: {
    setUILayout: jest.fn(async (): Promise<void> => undefined),
  },
}));

jest.mock('../../src/ui/widgets/EditorView', () => ({
  __esModule: true,
  default: (): React.JSX.Element => <p>Document consumer</p>,
}));

function renderShell(layout: UILayout): void {
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: {},
      activeDocumentId: null,
      ui: layout,
    }),
  );

  render(
    <Provider store={store}>
      <AppShell />
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(resetProjection());
});

afterEach(() => {
  store.dispatch(resetProjection());
});

it('renders workspace and document regions while reserving the assistant track', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  expect(
    screen.getByRole('complementary', { name: 'Workspace' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('main', { name: 'Document area' })).toHaveTextContent(
    'Document consumer',
  );
  expect(screen.queryByLabelText(/assistant/i)).not.toBeInTheDocument();
});
