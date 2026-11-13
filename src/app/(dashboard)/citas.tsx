import { Stack } from 'expo-router';

import { ModuleScreen } from '@/components/module-screen';
import type { Cita } from '@/modules/models';

function summary(item: Cita): string {
  return `Dr. ${item.medico} · ${item.lugar} · ${item.fecha} ${item.hora}`;
}

export default function CitasScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ModuleScreen
        title="Citas"
        subtitle="Turnos médicos: lugar, fecha y hora"
        collection="citas"
        accent="#0284C7"
        emptyText="No hay citas agendadas. Tocá “+ Agregar” para agendar un turno."
        titleField="titulo"
        fields={[
          { key: 'titulo', label: 'Motivo', placeholder: 'Por ejemplo: Control de presión' },
          { key: 'medico', label: 'Médico', placeholder: 'Nombre del doctor' },
          { key: 'lugar', label: 'Lugar', placeholder: 'Consultorio o dirección' },
          { key: 'fecha', label: 'Fecha (AAAA-MM-DD)', placeholder: '2025-12-01', date: true },
          { key: 'hora', label: 'Hora (HH:MM)', placeholder: '09:30', time: true },
        ]}
        summary={summary as never}
      />
    </>
  );
}
