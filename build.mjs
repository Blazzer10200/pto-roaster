import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'vite';
await build();
await mkdir('dist/client', { recursive: true });
for (const file of ['index.html','styles.css','app.js','model.js','player-picker.js','cloud.js','pto.gif','pto-still.png']) {
  await copyFile(file, 'dist/client/' + file);
}
console.log('Worker and browser files ready.');
