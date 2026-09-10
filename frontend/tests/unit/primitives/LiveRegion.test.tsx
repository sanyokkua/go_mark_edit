import { render, screen } from '@testing-library/react';

import LiveRegion from '../../../src/ui/primitives/LiveRegion';

it('renders a polite atomic status region', () => {
  render(<LiveRegion message="Moved readme.md to position 2 of 3" />);
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
});
