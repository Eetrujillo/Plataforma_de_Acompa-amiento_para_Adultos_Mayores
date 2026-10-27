import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import { SessionExpiredModal } from './components/auth/SessionExpiredModal';
import { AppRoutes } from './routes/AppRoutes';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <SessionExpiredModal />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
