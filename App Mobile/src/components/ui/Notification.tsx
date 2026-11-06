import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from './AppText';

export type NotificationType = 'error' | 'success' | 'info' | 'warning';

/** Aviso en línea. Equivale a `.notification` de la web. */
export function Notification({
  type = 'info',
  children,
}: {
  type?: NotificationType;
  children?: ReactNode;
}) {
  const theme = useTheme();

  if (!children) return null;

  const palette = {
    error: { bg: theme.colors.errorBg, border: theme.colors.errorBorder, text: theme.colors.errorText },
    success: {
      bg: theme.colors.successBg,
      border: theme.colors.successBorder,
      text: theme.colors.successText,
    },
    info: { bg: theme.colors.infoBg, border: theme.colors.infoBorder, text: theme.colors.infoText },
    warning: {
      bg: theme.colors.warningBg,
      border: theme.colors.warningBorder,
      text: theme.colors.warningText,
    },
  }[type];

  return (
    <View
      accessibilityRole={type === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
      style={[
        styles.box,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: theme.radius.control,
          padding: theme.spacing.sm,
        },
      ]}
    >
      <AppText style={{ color: palette.text, fontWeight: '600' }}>{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 2, width: '100%' },
});
