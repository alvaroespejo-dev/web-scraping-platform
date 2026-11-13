import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @scraping/shared is compiled as CommonJS: Vite must pre-bundle it to expose its named exports.
  optimizeDeps: { include: ['@scraping/shared'] },
  server: {
    port: 5173,
    // In development, requests to /api are forwarded to the NestJS API.
    proxy: { '/api': { target: 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
