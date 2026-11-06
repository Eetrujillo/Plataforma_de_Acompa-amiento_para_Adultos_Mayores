import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import {
  SECOND_REMINDER_DELAY_MINUTES,
  getPermission,
  isSecureContext,
  requestPermission,
  showReminderNotification,
  signalReminder,
} from '../../services/reminderService';
import type { ReminderPermission } from '../../services/reminderService';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Notification } from '../ui/Notification';

/**
 * HU-016 - Activación de los avisos.
 *
 * El permiso del navegador no se puede pedir solo: exige un toque del usuario.
 * Por eso hay un botón explícito. En móvil el aviso en pantalla y la vibración
 * no necesitan permiso, así que se muestran como activados.
 */
export function ReminderSettings() {
  const theme = useTheme();
  const [permission, setPermission] = useState<ReminderPermission>(() => getPermission());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setPermission(getPermission());
  }, []);

  async function handleEnable() {
    setBusy(true);
    setNotice('');

    try {
      const result = await requestPermission();
      setPermission(result);

      if (result === 'granted') {
        setNotice('Listo. Te avisaremos a la hora de cada actividad.');
        signalReminder();
      }
    } finally {
      setBusy(false);
    }
  }

  function handleTest() {
    signalReminder();
    showReminderNotification({
      key: 'prueba',
      activityId: 'prueba',
      title: 'Así se verá tu aviso',
      iconEmoji: '🔔',
      kind: 'initial',
      fireAt: Date.now(),
      time: '',
    });
    setNotice('Enviamos un aviso de prueba.');
  }

  return (
    <Card>
      <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
        Avisos de mis actividades
      </AppText>

      <AppText variant="muted">
        Si activas los avisos, te avisamos a la hora de cada actividad. Si a los{' '}
        {SECOND_REMINDER_DELAY_MINUTES} minutos todavía no la marcaste como hecha, te
        avisamos otra vez.
      </AppText>

      {notice ? <Notification type="success">{notice}</Notification> : null}

      {permission === 'granted' ? (
        <>
          <AppText style={{ color: theme.colors.successText, fontWeight: '700' }}>
            Los avisos están activados.
          </AppText>
          <Button label="Probar el aviso" variant="secondary" onPress={handleTest} />
        </>
      ) : permission === 'denied' ? (
        <View style={{ gap: 8 }}>
          <Notification type="warning">
            Los avisos están bloqueados. Para activarlos: abre la configuración del equipo, busca
            el navegador o la app, entra en Notificaciones y permite los avisos.
          </Notification>
        </View>
      ) : (
        <Button
          label={busy ? 'Activando…' : 'Activar avisos'}
          onPress={() => void handleEnable()}
          loading={busy}
        />
      )}

      <AppText variant="muted" style={{ fontSize: theme.font.small }}>
        {Platform.OS === 'web'
          ? 'Los avisos suenan mientras la app está abierta. Deja la pestaña abierta para escucharlos.'
          : 'Los avisos aparecen en pantalla y vibran mientras la app está abierta.'}
      </AppText>

      {Platform.OS === 'web' && !isSecureContext() ? (
        <Notification type="warning">
          Los avisos del navegador necesitan una conexión segura (https).
        </Notification>
      ) : null}
    </Card>
  );
}
