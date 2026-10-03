import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { liveUpdater } from './services/updater';
import { crashService } from './lib/crashlytics/crashService';
import { analytics } from './lib/analytics/posthog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { RoommateSyncProvider } from './context/RoommateSyncContext';

// Initialize live update engine and signal successful boot
liveUpdater.init().catch(console.error);

// Initialize remote crash reporting & product telemetry
crashService.init().catch(console.warn);
analytics.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <RoommateSyncProvider>
          <App />
        </RoommateSyncProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);

