import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Misma configuración que la versión anterior, apuntando al backend de
 * `prod_local` (puerto 3500).
 *
 * `base` se deja en `/` a propósito: la app usa rutas reales (`/hoy`,
 * `/actividades`, `/app`). Con una base relativa, al entrar directo a una ruta
 * profunda el navegador pediría `/hoy/assets/...` y no encontraría el bundle.
 */
const backend = process.env.VITE_PROXY_TARGET || 'http://localhost:3500';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3201,
    host: true,
    allowedHosts: ['localhost', '127.0.0.1'],
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/socket.io': { target: backend, ws: true, changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
