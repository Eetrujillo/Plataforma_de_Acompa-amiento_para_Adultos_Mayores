import { Stack } from 'expo-router';

import { ModuleScreen } from '@/components/module-screen';
import type { Tarea } from '@/modules/models';

function summary(item: Tarea): string {
  return item.completada ? 'Completada ✔' : 'Pendiente de hacer';
}

export default function TareasScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ModuleScreen
        title="Tareas"
        subtitle="Actividades diarias con estado"
        collection="tareas"
        accent="#F97316"
        emptyText="No hay tareas todavía. Tocá “+ Agregar” para empezar."
        titleField="titulo"
        toggle={{ field: 'completada', labelOn: 'Hecha', labelOff: 'Marcar hecha' }}
        fields={[
          { key: 'titulo', label: 'Tarea', placeholder: 'Por ejemplo: Caminar 20 minutos' },
        ]}
        summary={summary as never}
      />
    </>
  );
}
