import { Stack } from 'expo-router';

import { ModuleScreen } from '@/components/module-screen';
import type { Alerta } from '@/modules/models';

function summary(item: Alerta): string {
  return `${item.nivel} · ${item.fecha}${item.mensaje ? ` · ${item.mensaje}` : ''}`;
}

export default function AlertasScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ModuleScreen
        title="Alertas"
        subtitle="Recordatorios y avisos importantes"
        collection="alertas"
        accent="#EC4899"
        emptyText="No hay alertas todavía. Tocá “+ Agregar” para crear un aviso."
        titleField="titulo"
        fields={[
          { key: 'titulo', label: 'Título', placeholder: 'Por ejemplo: Renovar receta' },
          { key: 'mensaje', label: 'Detalle', placeholder: 'Qué hay que hacer', multiline: true },
          { key: 'nivel', label: 'Nivel', options: ['información', 'importante'] },
          { key: 'fecha', label: 'Fecha (AAAA-MM-DD)', placeholder: '2025-12-01', date: true },
        ]}
        summary={summary as never}
      />
    </>
  );
}
