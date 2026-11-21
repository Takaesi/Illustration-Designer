import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSuggester } from './suggest.mjs';

const root = fileURLToPath(new URL('./dist',import.meta.url));
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.json':'application/json' };

function json(response,status,body) {
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify(body));
}

async function suggestRoute(request,response,suggest) {
  if (request.method!=='POST') {
    response.setHeader('Allow','POST');
    return json(response,405,{error:'Используйте POST.'});
  }
  if (request.headers['content-type']?.split(';')[0].trim()!=='application/json') {
    return json(response,415,{error:'Ожидается JSON.'});
  }
  let bytes = 0;
  const parts = [];
  try {
    for await (const chunk of request.iterator({destroyOnReturn:false})) {
      bytes += chunk.length;
      if (bytes>4096) {
        request.resume();
        return json(response,413,{error:'Запрос слишком большой.'});
      }
      parts.push(chunk);
    }
    const payload = JSON.parse(Buffer.concat(parts).toString('utf8'));
    return json(response,200,await suggest(payload?.title));
  } catch(error) {
    if (error instanceof SyntaxError) return json(response,400,{error:'Некорректный JSON.'});
    return json(response,error.status || 500,{error:error.status ? error.message : 'Не удалось выполнить подбор.'});
  }
}

export function createHandler(suggest=createSuggester()) {
  return async (request,response) => {
    try {
      const path = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      if (path==='/api/suggest') return await suggestRoute(request,response,suggest);
      const file = resolve(root,'.'+(path==='/' ? '/index.html' : path));
      const type = types[extname(file)];
      if (!file.startsWith(root+sep) || !type) throw new Error('Not found');
      const data = await readFile(file);
      response.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache'});
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || (process.env.RENDER==='true' ? '0.0.0.0' : '127.0.0.1');
  createServer(createHandler()).listen(port,host,()=>console.log('http://'+host+':'+port));
}
