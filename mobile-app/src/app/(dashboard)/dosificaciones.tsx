import { Stack } from 'expo-router';

import { ModuleScreen } from '@/components/module-screen';
import type { Dosificacion } from '@/modules/models';

function summary(item: Dosificacion): string {
  return `Dosis: ${item.dosis} · Horario: ${item.horario}${item.notas ? ` · ${item.notas}` : ''}`;
}

export default function DosificacionesScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ModuleScreen
        title="Dosificación"
        subtitle="Medicamentos, dosis y horarios indicados por el médico"
        collection="dosificaciones"
        accent="#0D9488"
        emptyText="Todavía no hay dosificaciones cargadas. Tocá “+ Agregar” para empezar."
        titleField="medicamento"
        fields={[
          { key: 'medicamento', label: 'Medicamento', placeholder: 'Por ejemplo: Losartán 50 mg' },
          { key: 'dosis', label: 'Dosis', placeholder: 'Por ejemplo: 1 comprimido' },
          { key: 'horario', label: 'Horario (HH:MM)', placeholder: '08:00', time: true },
          { key: 'notas', label: 'Notas (opcional)', placeholder: 'Con comida, etc.', multiline: true, required: false },
        ]}
        summary={summary as never}
      />
    </>
  );
}
