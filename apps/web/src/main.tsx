import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { AuthProvider } from './components/AuthContext';

window.addEventListener('vite:preloadError', (event) => {
  try {
    const key = 'gil:preload-reloaded';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    event.preventDefault();
    window.location.reload();
  } catch {
    // Let the route error boundary handle the failure if storage is unavailable.
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
