import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempData, freePort } from './helpers.mjs';

const SERVER = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
let port;
let child;

// Petición cruda: fetch no deja elegir el Host ni el Origin a voluntad.
const call = (path, { method = 'GET', headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    });
    req.on('error', reject);
    req.end(body);
  });

before(async () => {
  port = await freePort();
  child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), REPOTECA_DATA: tempData() }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`el servidor salió con código ${code}`)));
    child.stdout.on('data', (b) => b.toString().includes('Repoteca en') && resolve());
  });
});

after(() => child?.kill());

const local = () => ({ host: `127.0.0.1:${port}` });

test('la API responde con el Host propio', async () => {
  const r = await call('/api/repos', { headers: local() });
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body).repos, []);
});

test('rechaza un Host ajeno (DNS rebinding)', async () => {
  for (const host of ['evil.example', `evil.example:${port}`, `localhost.evil.example:${port}`, `127.0.0.1:${port + 1}`]) {
    const r = await call('/api/repos', { headers: { host } });
    assert.equal(r.status, 403, host);
  }
});

test('rechaza peticiones que no son GET sin el Origin de la propia UI', async () => {
  const h = local();
  const sinOrigin = await call('/api/check', { method: 'POST', headers: h });
  assert.equal(sinOrigin.status, 403);
  const ajeno = await call('/api/check', { method: 'POST', headers: { ...h, origin: 'http://evil.example' } });
  assert.equal(ajeno.status, 403);
  const nulo = await call('/api/check', { method: 'POST', headers: { ...h, origin: 'null' } });
  assert.equal(nulo.status, 403);
});

test('acepta el Origin de la propia UI', async () => {
  const h = { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` };
  const r = await call('/api/check', { method: 'POST', headers: h });
  assert.equal(r.status, 200);
});

test('manda cabeceras que impiden incrustar la UI', async () => {
  const r = await call('/', { headers: local() });
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
});

test('no sirve archivos fuera de public/', async () => {
  for (const p of ['/..%2fsrc%2fcore.mjs', '/%2e%2e/src/core.mjs', '/../package.json']) {
    const r = await call(p, { headers: local() });
    assert.equal(r.status, 404, p);
  }
});

test('un repo que no existe en el catálogo da error con mensaje, no un volcado', async () => {
  const r = await call('/api/repos/nadie/nada', { headers: local() });
  assert.equal(r.status, 500);
  assert.match(JSON.parse(r.body).error, /No está en el catálogo/);
});
