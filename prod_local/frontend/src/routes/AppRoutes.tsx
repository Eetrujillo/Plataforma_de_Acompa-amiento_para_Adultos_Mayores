import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { ActivitiesPage } from '../pages/ActivitiesPage';
import { ConfirmEmailPage } from '../pages/ConfirmEmailPage';
import { Dashboard } from '../pages/Dashboard';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { LoginPage } from '../pages/LoginPage';
import { OlderAdultsPage } from '../pages/OlderAdultsPage';
import { PrivacyPolicyPage } from '../pages/PrivacyPolicyPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { TodayPage } from '../pages/TodayPage';
import { VerificationRequiredPage } from '../pages/VerificationRequiredPage';
import { OlderAdultHomePage } from '../pages/app/OlderAdultHomePage';
import { OlderAdultLinkPage } from '../pages/app/OlderAdultLinkPage';
import { OlderAdultSettingsPage } from '../pages/app/OlderAdultSettingsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/confirmar-correo" element={<ConfirmEmailPage />} />
      <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
      <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
      <Route path="/privacidad" element={<PrivacyPolicyPage />} />

      <Route path="/app/vincular" element={<OlderAdultLinkPage />} />
      <Route path="/app" element={<OlderAdultHomePage />} />
      <Route path="/app/ajustes" element={<OlderAdultSettingsPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/verificar-correo" element={<VerificationRequiredPage />} />
      </Route>

      <Route element={<ProtectedRoute requireVerified />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/adultos-mayores" element={<OlderAdultsPage />} />
        <Route path="/actividades" element={<ActivitiesPage />} />
        <Route path="/hoy" element={<TodayPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
