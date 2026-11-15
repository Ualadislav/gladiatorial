import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// GitHub Pages: https://ualadislav.github.io/gladiatorial/
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});

