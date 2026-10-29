import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import { SessionExpiredModal } from './components/auth/SessionExpiredModal';
import { ActivityReminderHost } from './components/app/ActivityReminderHost';
import { CompletionSyncHost } from './components/app/CompletionSyncHost';
import { AppRoutes } from './routes/AppRoutes';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <SessionExpiredModal />
        <ActivityReminderHost />
        <CompletionSyncHost />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
