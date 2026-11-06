import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { familyTheme } from './index';
import type { AppTheme } from './index';

/**
 * Tema activo.
 *
 * Los grupos de rutas del familiar y del adulto mayor envuelven sus pantallas
 * con el tema que les corresponde. Así los componentes compartidos (botón,
 * campo, tarjeta) cambian tamaño y contraste sin duplicar código.
 */

const ThemeContext = createContext<AppTheme>(familyTheme);

export function ThemeProvider({ theme, children }: { theme: AppTheme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}
