type Listener = () => void;

/**
 * Eventos internos de la app.
 *
 * La versión web usaba `window.dispatchEvent`. En React Native no hay `window`,
 * así que se usa este emisor mínimo. Lo consume `AuthProvider` para mostrar el
 * modal de "sesión vencida" sin desmontar la pantalla que el usuario estaba
 * llenando.
 */

const sessionExpiredListeners = new Set<Listener>();

export const appEvents = {
  onSessionExpired(listener: Listener): () => void {
    sessionExpiredListeners.add(listener);
    return () => {
      sessionExpiredListeners.delete(listener);
    };
  },

  emitSessionExpired(): void {
    for (const listener of sessionExpiredListeners) listener();
  },
};
