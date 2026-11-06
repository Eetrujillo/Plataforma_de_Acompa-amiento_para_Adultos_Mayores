import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { cardShadow } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';

/** Tarjeta blanca con borde visible, igual que `.card` en la web. */
export function Card({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.card,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
        },
        cardShadow,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 2,
  },
});
