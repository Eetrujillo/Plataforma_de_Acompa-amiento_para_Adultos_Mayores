import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { DEFAULT_ROUTE, IS_NATIVE_PLATFORM } from '../config/runtime.js';
import { useAuth } from '../../features/auth/application/AuthContext.jsx';
import { LoginScreen } from '../../features/auth/ui/LoginScreen.jsx';
import { DashboardPage } from '../../pages/caregiver/DashboardPage.jsx';
import { SeniorHomePage } from '../../pages/senior/SeniorHomePage.jsx';

/**
 * Native shells load the bundle from a local origin, so they need hash history;
 * the web deployment keeps clean URLs behind nginx.
 */
const Router = IS_NATIVE_PLATFORM ? HashRouter : BrowserRouter;

function RequireCaregiver({ children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'CAREGIVER') {
    return <Navigate to="/senior" replace />;
  }

  return children;
}

export function AppRouter() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route
          path="/caregiver"
          element={
            <RequireCaregiver>
              <DashboardPage />
            </RequireCaregiver>
          }
        />
        <Route path="/senior" element={<SeniorHomePage />} />
        <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
      </Routes>
    </Router>
  );
}
