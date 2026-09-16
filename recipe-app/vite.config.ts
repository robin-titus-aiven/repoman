import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // The Express server serves this from dist/client and compiles itself
    // alongside into dist/server.
    outDir: 'dist/client',
  },
  server: {
    port: 5178,
    // In development the API runs separately; in production the same Express
    // process serves both, so the frontend can always call /api directly.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
