import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()], 
  
  server: {
    port: 3201,
    allowedHosts: ['gestion-academica.apolobyte.top', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: 'http://backend:3505',
        changeOrigin: true
      }
    }
  }
});