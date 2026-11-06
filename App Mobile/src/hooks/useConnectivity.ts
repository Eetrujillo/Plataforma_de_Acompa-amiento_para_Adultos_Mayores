import { useEffect, useState } from 'react';

import { isOnline, subscribeConnectivity } from '../services/connectivity';

/** Estado de conexión reactivo para las pantallas del adulto mayor. */
export function useConnectivity(): boolean {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => subscribeConnectivity(setOnline), []);

  return online;
}
