import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { useTheme } from '../../theme/ThemeProvider';

/**
 * Contenedor de pantalla.
 *
 * - Respeta el área segura del teléfono (muesca, barra inferior).
 * - Centra el contenido y limita el ancho en web/tablet para que el texto no
 *   se estire de lado a lado.
 * - Deja el teclado usable: `keyboardShouldPersistTaps` evita que el primer
 *   toque en un botón solo cierre el teclado.
 */
export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const theme = useTheme();

  const content = (
    <View style={[styles.inner, { maxWidth: theme.maxContentWidth, gap: theme.spacing.md }]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, { padding: theme.spacing.md }]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { padding: theme.spacing.md }]}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    flexGrow: 1,
  },
});
