import { render, screen } from '@testing-library/react';

import Pane from '../../../../src/ui/components/Pane/Pane';

it('renders the identity, header slots, body and explicit accessory', () => {
  render(
    <Pane
      accessory={<div role="status">Preview is paused</div>}
      body={<p>Document body</p>}
      header={{
        leading: <span>Leading header</span>,
        trailing: <span>Trailing header</span>,
      }}
      identity="Editor pane"
    />,
  );

  const pane = screen.getByRole('region', { name: 'Editor pane' });
  expect(pane).toBeInTheDocument();
  expect(screen.getByText('Leading header')).toBeInTheDocument();
  expect(screen.getByText('Trailing header')).toBeInTheDocument();
  expect(screen.getByText('Document body')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Preview is paused');
});

it('keeps a hidden pane mounted while removing it from layout and accessibility', () => {
  render(
    <Pane
      body={<textarea aria-label="Editor" />}
      hidden
      identity="Editor pane"
    />,
  );

  const pane = screen.getByLabelText('Editor pane', { selector: 'section' });
  expect(pane).toHaveAttribute('aria-hidden', 'true');
  expect(pane).toHaveClass('paneHidden');
  expect(screen.getByLabelText('Editor')).toBeInTheDocument();
});
