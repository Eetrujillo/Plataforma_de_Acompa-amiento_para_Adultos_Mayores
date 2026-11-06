import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from './AppText';

/** Encabezado de pantalla: título grande y acciones. */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.header, { gap: theme.spacing.xs }]}>
      <View style={{ gap: theme.spacing.xxs }}>
        {eyebrow ? <AppText variant="eyebrow">{eyebrow}</AppText> : null}
        <AppText variant="hero" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? <AppText variant="muted">{subtitle}</AppText> : null}
      </View>

      {actions ? <View style={[styles.actions, { gap: theme.spacing.xs }]}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { width: '100%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
