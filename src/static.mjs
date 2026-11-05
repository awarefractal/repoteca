// Servidor estático mínimo para probar repos que son solo HTML. Sirve el directorio actual en $PORT.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const root = process.cwd();

const server = http.createServer((req, res) => {
  let f;
  try {
    f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  } catch {
    return void res.writeHead(400).end();
  }
  if (path.relative(root, f).startsWith('..')) return void res.writeHead(403).end();
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.readFile(f, (err, buf) => {
    if (err) return void res.writeHead(404).end('404');
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }).end(buf);
  });
});
server.listen(+process.env.PORT || 0, '127.0.0.1', () => {
  console.log(`Sirviendo ${root} en http://localhost:${server.address().port}/`);
});
