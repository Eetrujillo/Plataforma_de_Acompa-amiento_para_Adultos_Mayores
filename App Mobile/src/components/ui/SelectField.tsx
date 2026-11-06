import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from './AppText';
import { OptionPicker } from './OptionPicker';
import type { PickerOption } from './OptionPicker';

interface SelectFieldProps {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
}

/** Selector con etiqueta. Reemplaza a `SelectField.tsx` de la web. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  error,
  hint,
  placeholder = 'Selecciona una opción',
}: SelectFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.control,
          {
            minHeight: theme.controlHeight,
            borderRadius: theme.radius.control,
            borderColor: error ? theme.colors.errorBorder : theme.colors.border,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: theme.spacing.sm,
          },
          pressed && { opacity: 0.8 },
        ]}
      >
        <AppText
          numberOfLines={1}
          style={{
            color: selected ? theme.colors.text : theme.colors.placeholder,
            fontWeight: selected ? '600' : '400',
          }}
        >
          {selected?.label ?? placeholder}
        </AppText>
        <AppText style={{ color: theme.colors.muted, fontWeight: '700' }}>▾</AppText>
      </Pressable>

      {hint && !error ? (
        <AppText variant="muted" style={{ fontSize: theme.font.small }}>
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

      <OptionPicker
        visible={open}
        title={label}
        options={options}
        value={value}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, width: '100%' },
  control: {
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
