import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { StoreProvider } from './lib/store.jsx';
import { reloadOnce } from './lib/recover.js';
import App from './App.jsx';

// Vite raises this when a lazily loaded page's chunk cannot be fetched, which after a
// deploy means the tab is holding a superseded build. Start the reload here, and let the
// real error carry on to the boundary so the console records the true cause rather than
// the "reading 'default'" that swallowing it would produce. See lib/recover.js.
window.addEventListener('vite:preloadError', () => {
  reloadOnce();
});

// Strip the trailing slash so the router treats "/agora/" and "/" the same way.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
