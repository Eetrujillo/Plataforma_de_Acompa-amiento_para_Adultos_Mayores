import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { useTheme } from '../../theme/ThemeProvider';
import { cardShadow } from '../../theme';
import { startReminderScheduler } from '../../services/reminderService';
import type { ReminderItem } from '../../services/reminderService';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';

/**
 * HU-016 - Aviso de actividad en pantalla.
 *
 * Se monta una sola vez en el layout raíz. El aviso funciona aunque las
 * notificaciones del sistema estén bloqueadas; en ese caso es el único canal.
 * En móvil, además, vibra (ver `signalReminder`).
 */
export function ReminderHost() {
  const theme = useTheme();
  const [reminder, setReminder] = useState<ReminderItem | null>(null);

  useEffect(() => startReminderScheduler((item) => setReminder(item)), []);

  if (!reminder) return null;

  const isSecond = reminder.kind === 'second';

  return (
    <View style={styles.host} pointerEvents="box-none">
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={[
          styles.card,
          cardShadow,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.warningBorder,
            borderRadius: theme.radius.card,
            padding: theme.spacing.md,
            gap: theme.spacing.sm,
          },
        ]}
      >
        <AppText style={{ fontSize: theme.font.hero }}>{reminder.iconEmoji}</AppText>

        <AppText variant="eyebrow" style={{ color: theme.colors.warningText }}>
          {isSecond ? 'Todavía no la has hecho' : 'Es la hora'}
        </AppText>

        <AppText variant="title" style={{ fontSize: theme.font.title * 0.85 }}>
          {reminder.title}
        </AppText>

        <AppText variant="muted">
          {isSecond
            ? 'Ya pasaron 10 minutos y sigue sin marcar. Cuando la termines, márcala como hecha.'
            : 'Cuando la termines, márcala como hecha.'}
        </AppText>

        <Button
          label="Ver mis actividades"
          onPress={() => {
            setReminder(null);
            router.push('/app');
          }}
        />
        <Button
          label="Cerrar"
          variant="secondary"
          onPress={() => setReminder(null)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 680,
    borderWidth: 3,
  },
});
