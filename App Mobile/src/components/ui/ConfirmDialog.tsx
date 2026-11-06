import { Modal, StyleSheet, View } from 'react-native';

import { cardShadow } from '../../theme';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación.
 *
 * Se usa en acciones destructivas (eliminar actividad, desvincular) y en la
 * confirmación de fechas pasadas. No se cierra al tocar fuera: en un teléfono
 * un toque accidental no debe confirmar nada.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        <View
          accessible
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.card,
              padding: theme.spacing.lg,
              gap: theme.spacing.sm,
            },
            cardShadow,
          ]}
        >
          <AppText variant="title" style={{ fontSize: theme.font.title * 0.82 }}>
            {title}
          </AppText>
          <AppText variant="subtitle">{description}</AppText>

          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <Button
              label={busy ? 'Procesando…' : confirmLabel}
              onPress={onConfirm}
              disabled={busy}
              loading={busy}
              variant={danger ? 'danger' : 'primary'}
            />
            <Button
              label={cancelLabel}
              onPress={onCancel}
              disabled={busy}
              variant="secondary"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderWidth: 2,
  },
});
