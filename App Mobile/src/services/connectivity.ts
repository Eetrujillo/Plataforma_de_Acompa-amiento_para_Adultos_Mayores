import NetInfo from '@react-native-community/netinfo';

/**
 * Conectividad de la app.
 *
 * Reemplaza a `navigator.onLine` y a los eventos `online`/`offline` del
 * navegador. Se mantiene un único listener de NetInfo y se reparte a quien lo
 * necesite (cola de marcas HU-019, pantallas del adulto mayor).
 */

type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();

let online = true;
let started = false;

export function isOnline(): boolean {
  return online;
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(next: boolean): void {
  if (next === online) return;
  online = next;
  for (const listener of listeners) listener(online);
}

/**
 * Arranca el monitor una sola vez. Devuelve la función para detenerlo, pensada
 * para el desmontaje del layout raíz.
 */
export function startConnectivityMonitor(): () => void {
  if (started) return () => undefined;
  started = true;

  const unsubscribe = NetInfo.addEventListener((state) => {
    // `isInternetReachable` puede ser null mientras se comprueba: en ese caso se
    // confía en `isConnected` para no marcar "sin conexión" en falso.
    const reachable = state.isInternetReachable;
    const connected = state.isConnected !== false;

    update(connected && reachable !== false);
  });

  void NetInfo.fetch()
    .then((state) => {
      const reachable = state.isInternetReachable;
      update(state.isConnected !== false && reachable !== false);
    })
    .catch(() => undefined);

  return () => {
    unsubscribe();
    started = false;
  };
}
