import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // changeOrigin is deliberately OFF: it rewrites Host to the target, so the
      // API would see `localhost:4000` and hand a phone a LiveKit URL pointing at
      // the phone's own localhost. xfwd adds the X-Forwarded-* headers the API
      // already reads in production behind nginx.
      '/api': { target: 'http://localhost:4000', xfwd: true },
      '/uploads': { target: 'http://localhost:4000', xfwd: true },
      // Mirrors the production proxy so stored /media URLs resolve in dev too.
      '/media': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media/, '/tocs-media'),
      },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
