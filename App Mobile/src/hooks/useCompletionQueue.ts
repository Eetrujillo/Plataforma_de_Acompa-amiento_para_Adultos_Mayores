import { useEffect, useState } from 'react';

import {
  readCompletionQueue,
  subscribeToCompletionQueue,
} from '../services/completionQueue';
import type { QueuedCompletion } from '../types';

/** Cola de marcas pendientes de enviar (HU-019), reactiva a los cambios. */
export function useCompletionQueue(): QueuedCompletion[] {
  const [queue, setQueue] = useState<QueuedCompletion[]>(() => readCompletionQueue());

  useEffect(() => {
    setQueue(readCompletionQueue());
    return subscribeToCompletionQueue(() => setQueue(readCompletionQueue()));
  }, []);

  return queue;
}
