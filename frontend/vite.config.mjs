import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Relative base keeps the same bundle valid behind nginx and inside the
 * Capacitor shell (file:// origin).
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3201,
    host: true,
    allowedHosts: ['localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: 'http://localhost:3500',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3500',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
