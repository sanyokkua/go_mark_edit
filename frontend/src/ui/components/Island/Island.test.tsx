import { render, screen } from '@testing-library/react';

import Island from './Island';

// Proves: FR-038 — Island labels one formatting control group.
it('T023 renders a labelled Island around its children', () => {
  render(
    <Island label="Text formatting">
      <button type="button">Bold</button>
    </Island>,
  );

  const island = screen.getByRole('group', { name: 'Text formatting' });
  expect(island).toContainElement(screen.getByRole('button', { name: 'Bold' }));
  expect(island).toHaveAttribute('data-island-label', 'Text formatting');
});
