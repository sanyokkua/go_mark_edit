import { render, screen } from '@testing-library/react';

import App from './App';

it('STORY-001-AC-2 renders the blank application root', () => {
  render(<App />);

  expect(screen.getByRole('main')).toBeEmptyDOMElement();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/greet|hello|markdown|document|file/i),
  ).not.toBeInTheDocument();
});
