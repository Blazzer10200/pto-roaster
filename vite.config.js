import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
export default defineConfig({
  plugins: [sites()],
  ssr: {noExternal: ['qrcode','pngjs','dijkstrajs']},
  build: {
    ssr: 'worker.js',
    outDir: 'dist/server',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'index.js' } },
  },
});
