import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { applyTheme, getStoredTheme } from './lib/theme';
import './i18n/config';
import { startUpdateWatcher } from './lib/update';

// Applied before the first render so an explicit theme choice never flashes the other theme.
applyTheme(getStoredTheme());

// Registered unconditionally (not just on push opt-in) so the app is installable as soon as
// it's first visited, and watched so an installed app notices new versions.
startUpdateWatcher();

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
