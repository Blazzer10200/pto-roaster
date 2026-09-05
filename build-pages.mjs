import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {clientFiles} from './client-files.mjs';
await mkdir('dist/pages',{recursive:true});
for(const file of clientFiles) await copyFile(file,'dist/pages/'+file);
await writeFile('dist/pages/.nojekyll','');
console.log('GitHub Pages files ready in dist/pages.');
