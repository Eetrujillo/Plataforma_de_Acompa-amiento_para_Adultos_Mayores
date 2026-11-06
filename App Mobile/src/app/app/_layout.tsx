import { Stack } from 'expo-router';

import { seniorTheme } from '../../theme';
import { ThemeProvider } from '../../theme/ThemeProvider';

/**
 * Layout de la app del adulto mayor.
 *
 * Todo lo que cuelga de `/app` usa el tema de accesibilidad: texto base 20,
 * controles de 64 puntos y alto contraste. Es el mismo criterio de
 * `.senior-app` en la web.
 */
export default function SeniorLayout() {
  return (
    <ThemeProvider theme={seniorTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: seniorTheme.colors.background },
        }}
      />
    </ThemeProvider>
  );
}
