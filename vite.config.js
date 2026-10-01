import { defineConfig } from 'vite';

// Tauri, geliştirme sırasında bu sunucuya bağlanır (tauri.conf.json → devUrl).
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'es2021',
    outDir: 'dist',
  },
});
