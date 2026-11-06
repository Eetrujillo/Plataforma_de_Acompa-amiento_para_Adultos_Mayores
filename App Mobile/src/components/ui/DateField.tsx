import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import {
  MONTHS,
  daysInMonth,
  formatShortDate,
  parseDateKey,
  toDateKey,
} from '../../utils/activity';
import { AppText } from './AppText';
import { OptionPicker } from './OptionPicker';
import type { PickerOption } from './OptionPicker';

interface DateFieldProps {
  label: string;
  /** Fecha en formato `YYYY-MM-DD`. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

/**
 * Campo de fecha sin dependencias nativas.
 *
 * `type="date"` no existe en React Native. Se ofrecen tres listas táctiles
 * (día, mes y año), que funcionan igual en web, iOS y Android y mantienen
 * controles grandes para el adulto mayor.
 */
export function DateField({ label, value, onChange, error, hint }: DateFieldProps) {
  const theme = useTheme();
  const parts = parseDateKey(value) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, index) => currentYear - 1 + index);
  if (!years.includes(parts.year)) years.unshift(parts.year);

  const update = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    const max = daysInMonth(next.year, next.month);
    onChange(toDateKey({ ...next, day: Math.min(next.day, max) }));
  };

  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>

      <View style={styles.row}>
        <MiniSelect
          label="Día"
          value={String(parts.day)}
          options={Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, index) => ({
            value: String(index + 1),
            label: String(index + 1),
          }))}
          onChange={(next) => update({ day: Number(next) })}
        />
        <MiniSelect
          label="Mes"
          value={String(parts.month)}
          options={MONTHS.map((month, index) => ({
            value: String(index + 1),
            label: month.charAt(0).toUpperCase() + month.slice(1),
          }))}
          onChange={(next) => update({ month: Number(next) })}
        />
        <MiniSelect
          label="Año"
          value={String(parts.year)}
          options={years.map((year) => ({ value: String(year), label: String(year) }))}
          onChange={(next) => update({ year: Number(next) })}
        />
      </View>

      {!error ? (
        <AppText variant="muted" style={{ fontSize: theme.font.small }}>
          {hint ?? `Fecha elegida: ${formatShortDate(toDateKey(parts))}`}
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

/** Selector compacto usado dentro de `DateField` y `TimeField`. */
export function MiniSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.mini}>
      <AppText variant="value" style={{ fontSize: theme.font.small, fontWeight: '700' }}>
        {label}
      </AppText>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? value}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.miniControl,
          {
            minHeight: theme.controlHeight,
            borderRadius: theme.radius.control,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
          pressed && { opacity: 0.8 },
        ]}
      >
        <AppText numberOfLines={1}>{selected?.label ?? value}</AppText>
      </Pressable>

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
  row: { flexDirection: 'row', gap: 8 },
  mini: { flex: 1, gap: 4 },
  miniControl: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
