import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  /** Ocupa todo el ancho de la tarjeta (botón grande del adulto mayor). */
  block?: boolean;
}

/**
 * Botón accesible.
 *
 * En React Native no hay `<button>`: se usa `Pressable` con
 * `accessibilityRole="button"` y un estado `disabled` real. La altura mínima
 * sale del tema (56 familiar, 68 adulto mayor) para que se pueda tocar sin
 * apuntar con precisión.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  block = true,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const palette = {
    primary: {
      background: theme.colors.primary,
      border: theme.colors.primary,
      text: theme.colors.primaryText,
    },
    secondary: {
      background: theme.colors.surface,
      border: theme.colors.border,
      text: theme.colors.text,
    },
    danger: {
      background: theme.colors.errorBg,
      border: theme.colors.errorBorder,
      text: theme.colors.errorText,
    },
    ghost: {
      background: 'transparent',
      border: 'transparent',
      text: theme.colors.primary,
    },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: theme.buttonHeight,
          borderRadius: theme.radius.control,
          backgroundColor: palette.background,
          borderColor: palette.border,
          alignSelf: block ? 'stretch' : 'flex-start',
          paddingHorizontal: theme.spacing.md,
        },
        variant === 'primary' && { borderWidth: 0 },
        variant !== 'primary' && { borderWidth: 2 },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: palette.text, fontSize: theme.font.base },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
  label: {
    fontWeight: '800',
    textAlign: 'center',
  },
});
