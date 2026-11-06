import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { formatTimeLabel, isValidTime } from '../../utils/activity';
import { AppText } from './AppText';
import { MiniSelect } from './DateField';

interface TimeFieldProps {
  label: string;
  /** Hora en formato `HH:MM` (24 horas). */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

/** Campo de hora con dos listas: hora (00-23) y minuto (00-59). */
export function TimeField({ label, value, onChange, error, hint }: TimeFieldProps) {
  const theme = useTheme();

  const safeValue = isValidTime(value) ? value : '09:00';
  const [hours = '09', minutes = '00'] = safeValue.split(':');

  function update(nextHours: string, nextMinutes: string) {
    onChange(`${nextHours.padStart(2, '0')}:${nextMinutes.padStart(2, '0')}`);
  }

  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>

      <View style={styles.row}>
        <MiniSelect
          label="Hora"
          value={hours}
          options={Array.from({ length: 24 }, (_, index) => ({
            value: String(index).padStart(2, '0'),
            label: String(index).padStart(2, '0'),
          }))}
          onChange={(next) => update(next, minutes)}
        />
        <MiniSelect
          label="Minuto"
          value={minutes}
          options={Array.from({ length: 60 }, (_, index) => ({
            value: String(index).padStart(2, '0'),
            label: String(index).padStart(2, '0'),
          }))}
          onChange={(next) => update(hours, next)}
        />
      </View>

      {!error ? (
        <AppText variant="muted" style={{ fontSize: theme.font.small }}>
          {hint ?? `Hora elegida: ${formatTimeLabel(safeValue)}`}
        </AppText>
      ) : (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: theme.colors.errorText, fontSize: theme.font.small, fontWeight: '700' }}
        >
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, width: '100%' },
  row: { flexDirection: 'row', gap: 8 },
});
