import { Text } from 'react-native';
import type { TextProps } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';

export type TextVariant =
  | 'hero'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'muted'
  | 'eyebrow'
  | 'label'
  | 'value';

/**
 * Texto base de la app.
 *
 * Centraliza tamaño, color y peso para que ninguna pantalla quede por debajo
 * del mínimo de accesibilidad (18 en familiar, 20 en adulto mayor).
 */
export function AppText({
  variant = 'body',
  style,
  ...props
}: TextProps & { variant?: TextVariant }) {
  const theme = useTheme();

  const variantStyle = {
    hero: {
      fontSize: theme.font.hero,
      fontWeight: '800' as const,
      color: theme.colors.text,
      lineHeight: theme.font.hero * 1.2,
    },
    title: {
      fontSize: theme.font.title,
      fontWeight: '800' as const,
      color: theme.colors.text,
      lineHeight: theme.font.title * 1.25,
    },
    subtitle: {
      fontSize: theme.font.base,
      color: theme.colors.muted,
      lineHeight: theme.font.base * 1.5,
    },
    body: {
      fontSize: theme.font.base,
      color: theme.colors.text,
      lineHeight: theme.font.base * 1.5,
    },
    muted: {
      fontSize: theme.font.base,
      color: theme.colors.muted,
      lineHeight: theme.font.base * 1.5,
    },
    eyebrow: {
      fontSize: theme.font.small,
      color: theme.colors.primary,
      fontWeight: '800' as const,
      letterSpacing: 1.2,
      textTransform: 'uppercase' as const,
    },
    label: {
      fontSize: theme.font.label,
      color: theme.colors.text,
      fontWeight: '700' as const,
    },
    value: {
      fontSize: theme.font.base,
      color: theme.colors.muted,
    },
  }[variant];

  return <Text {...props} style={[variantStyle, style]} />;
}
