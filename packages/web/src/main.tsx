import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { applyTheme, getStoredTheme } from './lib/theme';
import './i18n/config';

// Applied before the first render so an explicit theme choice never flashes the other theme.
applyTheme(getStoredTheme());

// Registered unconditionally (not just on push opt-in) so the app is installable as soon as
// it's first visited — most installability checks (desktop Chrome/Edge, Android) want an
// active controlling service worker, not just a manifest.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
