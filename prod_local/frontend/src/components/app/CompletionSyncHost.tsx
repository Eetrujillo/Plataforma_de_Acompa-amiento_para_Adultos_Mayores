import { useEffect } from 'react';
import { startCompletionSync } from '../../services/completionQueue';

/**
 * HU-019 - Envio automatico de las marcas hechas sin internet.
 *
 * Se monta una sola vez en `main.jsx` para que la cola se envie aunque el
 * adulto mayor este en otra pantalla de la app.
 */
export function CompletionSyncHost() {
  useEffect(() => startCompletionSync(), []);

  return null;
}
