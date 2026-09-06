import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'vite';
import { buildClient } from './build-client.mjs';
await build();
await buildClient('dist/client');
console.log('Worker and browser files ready.');
