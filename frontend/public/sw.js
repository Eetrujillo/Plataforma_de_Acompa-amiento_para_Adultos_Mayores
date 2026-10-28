/* HU-016 - Avisos de actividades del adulto mayor.
 *
 * El service worker solo se encarga de devolver el foco a la app cuando el
 * adulto mayor toca el aviso. La notificacion la muestra la propia pagina con
 * `registration.showNotification`, asi que aqui no hace falta interceptar
 * mensajes. Tampoco se cachea el shell: obligaria a invalidar versiones en cada
 * despliegue y no aporta nada a los avisos.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = data.url || '/app';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Primero intenta enfocar una pestana que ya este en la app del adulto mayor.
      for (const client of clientList) {
        if (client.url.indexOf('/app') !== -1 && 'focus' in client) {
          return client.focus();
        }
      }

      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }

      return undefined;
    })
  );
});
