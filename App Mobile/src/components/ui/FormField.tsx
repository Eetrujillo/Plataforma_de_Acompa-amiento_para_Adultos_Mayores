import { StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from './AppText';

interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Campo de texto con etiqueta, ayuda y error.
 *
 * Reemplaza a `FormField.tsx` de la web. La etiqueta es texto visible (no
 * placeholder) y el error se anuncia con `accessibilityLiveRegion`, que en
 * Android y web se traduce a una región viva para lectores de pantalla.
 */
export function FormField({ label, error, hint, ...props }: FormFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>

      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityState={{ disabled: props.editable === false }}
        placeholderTextColor={theme.colors.placeholder}
        style={[
          styles.input,
          {
            minHeight: theme.controlHeight,
            borderRadius: theme.radius.control,
            borderColor: error ? theme.colors.errorBorder : theme.colors.border,
            backgroundColor: theme.colors.surface,
            color: theme.colors.inputText,
            fontSize: theme.font.base,
            paddingHorizontal: theme.spacing.sm,
          },
          props.multiline && styles.multiline,
        ]}
      />

      {hint && !error ? (
        <AppText variant="value" style={{ fontSize: theme.font.small }}>
          {hint}
        </AppText>
      ) : null}

      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: theme.colors.errorText, fontSize: theme.font.small, fontWeight: '700' }}
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, width: '100%' },
  input: {
    width: '100%',
    borderWidth: 2,
  },
  multiline: {
    minHeight: 120,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});
