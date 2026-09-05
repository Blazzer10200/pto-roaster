import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'vite';
import { clientFiles } from './client-files.mjs';
await build();
await mkdir('dist/client', { recursive: true });
for (const file of clientFiles) {
  await copyFile(file, 'dist/client/' + file);
}
console.log('Worker and browser files ready.');
