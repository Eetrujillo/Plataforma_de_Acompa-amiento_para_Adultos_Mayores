import { useEffect } from 'react';

import { startCompletionSync } from '../../services/completionQueue';

/**
 * HU-019 - Envío automático de las marcas hechas sin internet.
 *
 * Se monta una sola vez en el layout raíz para que la cola se envíe aunque el
 * adulto mayor esté en otra pantalla.
 */
export function CompletionSyncHost() {
  useEffect(() => startCompletionSync(), []);

  return null;
}
