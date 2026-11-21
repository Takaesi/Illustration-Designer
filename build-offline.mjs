import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = name=>readFile(new URL('./dist/'+name,import.meta.url),'utf8');
const url = text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const names = ['catalog.js','layout.js','svg.js','app.js'];
const modules = {};
for (const name of names) {
  const code = (await source(name)).replace(/from '\.\/([^']+)'/g,(_,dependency)=>{
    if (!modules[dependency]) throw new Error('Не найден модуль '+dependency);
    return "from '"+modules[dependency]+"'";
  });
  modules[name] = url(code);
}
const folder = new URL('./dist/assets/',import.meta.url);
const files = (await readdir(folder)).filter(name=>name.endsWith('.svg')).sort();
const assets = Object.fromEntries(await Promise.all(files.map(async name=>[
  name.slice(0,-4), await source('assets/'+name),
])));
const library = JSON.stringify({version:1,assets}).replaceAll('<','\\u003c');
const css = await source('style.css');
const html = (await source('index.html'))
  .replace('<link rel="stylesheet" href="./style.css">',()=>'<style>' + css + '</style>')
  .replace('<script type="module" src="./app.js"></script>', '');
const output = html.replace('</body>',()=>'<script id="bundled-library" type="application/json">'+library+'</script>\n'
  + '<script type="module" src="'+modules['app.js']+'"></script>\n</body>');
const target = resolve(process.argv[2] ?? 'dist/offline.html');
await writeFile(target,output);
console.log(target);
