import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './ui/styles/base.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Application root is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
