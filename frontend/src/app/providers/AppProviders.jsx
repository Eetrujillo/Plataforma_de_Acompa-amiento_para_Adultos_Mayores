import { AuthProvider } from '../../features/auth/application/AuthContext.jsx';

/**
 * Global providers. The router is mounted by the shell, outside this tree, so
 * it can own the platform-specific history strategy.
 */
export function AppProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
