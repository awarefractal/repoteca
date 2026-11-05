// Servidor local de la UI + API. Solo escucha en 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  ROOT, addMany, listRepos, getView, updateRepo, removeRepo, uninstallRepo, listCategories,
  startJob, stopJob, readLog, checkUpdate, checkAll, createDemo, reveal,
} from './core.mjs';

const PORT = +process.env.PORT || 4747;
const PUBLIC = path.join(ROOT, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Esta API ejecuta comandos: solo acepta peticiones que vengan de la propia UI
// (evita que otra página abierta en el navegador la use, incluido DNS rebinding).
function guard(req) {
  const host = req.headers.host;
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) throw new HttpError(403, 'Host no permitido');
  if (req.method !== 'GET' && req.headers.origin !== `http://${host}`) throw new HttpError(403, 'Origen no permitido');
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw new HttpError(413, 'Cuerpo demasiado grande');
  }
  return raw ? JSON.parse(raw) : {};
}

async function api(req, url, parts) {
  const [, resource, owner, name, action] = parts;
  const method = req.method;

  if (resource === 'repos' && !owner) {
    if (method === 'GET') return { repos: listRepos(), categories: listCategories() };
    if (method === 'POST') {
      const b = await body(req);
      return addMany(b.urls, b);
    }
  }
  if (resource === 'check' && method === 'POST') return { repos: await checkAll() };

  if (resource === 'repos' && owner && name) {
    const id = `${owner}/${name}`;
    if (!action) {
      if (method === 'GET') return getView(id);
      if (method === 'PATCH') return updateRepo(id, await body(req));
      if (method === 'DELETE') return removeRepo(id, { deleteFiles: url.searchParams.get('files') === '1', deleteDemo: url.searchParams.get('demo') === '1' });
    }
    if (method === 'GET' && action === 'log') return { log: readLog(id, +url.searchParams.get('tail') || 300) };
    if (method === 'POST') {
      if (['install', 'update', 'run', 'demo'].includes(action)) return startJob(id, action);
      if (action === 'create-demo') return createDemo(id);
      if (action === 'reveal') return reveal(id, (await body(req)).what);
      if (action === 'stop') return stopJob(id);
      if (action === 'uninstall') return uninstallRepo(id);
      if (action === 'check') return checkUpdate(id);
    }
  }
  throw new HttpError(404, 'No encontrado');
}

function serveStatic(res, pathname) {
  const file = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  if (path.relative(PUBLIC, file).startsWith('..') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    throw new HttpError(404, 'No encontrado');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  try {
    guard(req);
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== 'api') return serveStatic(res, url.pathname);
    const result = await api(req, url, parts);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
  } catch (e) {
    const status = e.status || (e instanceof SyntaxError ? 400 : 500);
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
  }
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `El puerto ${PORT} está ocupado (¿ya está abierto?). Usa PORT=otro.` : e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`Repoteca en ${url}`);
  if (process.argv.includes('--open')) {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore' }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' }).unref();
  }
});
