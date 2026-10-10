import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
const contract=(await fs.readFile(path.join(web,'public-atlas-contract.mjs'),'utf8')).replace(/^export /gm,'');
const runtime=await fs.readFile(path.join(web,'public-reader-runtime.js'),'utf8');
await fs.writeFile(path.join(web,'public-reader.js'),'// Generated public-only offline reader; rebuild with tools/build_public_reader.mjs.\n(function(){\n'+contract+'\n'+runtime+'\n})();\n');
console.log('Public reader bundled without private project code or dependencies.');
