import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tempData } from './helpers.mjs';

const data = tempData();
process.env.REPOTECA_DATA = data;
const core = await import('../src/core.mjs');

// Un "repo de GitHub" local: el catálogo solo usa su url para `git clone`, así que no hace falta red.
const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'repoteca-origin-'));
const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=main', ...args], { cwd: origin, stdio: 'ignore' });
fs.writeFileSync(path.join(origin, 'package.json'), '{"name":"fixture"}');
git('init');
git('add', '-A');
git('commit', '-m', 'init');

const marker = 'instalado.txt';
const repo = {
  id: 'octo/fixture',
  installPath: '',
  url: origin,
  fullName: 'octo/fixture',
  description: '',
  language: '',
  stars: 0,
  topics: [],
  license: '',
  category: '',
  tags: [],
  notes: '',
  verdict: 'sin-probar',
  // El "npm install" de este repo de prueba: deja una marca si de verdad se ejecuta.
  installCmd: `node -e "require('fs').writeFileSync('${marker}','x')"`,
  runCmd: '',
  addedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(data, 'catalog.json'), JSON.stringify({ repos: [repo] }));

const dir = () => core.getView('octo/fixture').localPath;

test('modo seguro: instalar solo clona y deja las dependencias pendientes', async () => {
  core.startJob('octo/fixture', 'install', { safe: true });
  const job = await core.waitJob('octo/fixture', 60000);
  assert.equal(job.state, 'ok', core.readLog('octo/fixture'));
  const v = core.getView('octo/fixture');
  assert.equal(v.installed, true);
  assert.equal(v.depsPending, true);
  assert.equal(v.status, 'dependencias-pendientes');
  assert.equal(v.commands.installCmd, repo.installCmd); // el comando que se le mostrará al usuario
  assert.equal(fs.existsSync(path.join(dir(), marker)), false, 'el comando de instalación no debe correr sin confirmar');
});

test('confirmar (deps) ejecuta el comando y limpia el estado pendiente', async () => {
  core.startJob('octo/fixture', 'deps');
  const job = await core.waitJob('octo/fixture', 60000);
  assert.equal(job.state, 'ok', core.readLog('octo/fixture'));
  assert.equal(fs.existsSync(path.join(dir(), marker)), true);
  const v = core.getView('octo/fixture');
  assert.equal(v.depsPending, false);
  assert.equal(v.status, 'instalado');
});

test('actualizar en modo seguro sin cambios nuevos no pide reinstalar', async () => {
  core.startJob('octo/fixture', 'update', { safe: true });
  const job = await core.waitJob('octo/fixture', 60000);
  assert.equal(job.state, 'ok', core.readLog('octo/fixture'));
  assert.equal(core.getView('octo/fixture').depsPending, false);
});

test('desinstalar limpia el estado pendiente y deps exige un repo instalado', async () => {
  core.uninstallRepo('octo/fixture');
  assert.equal(core.getView('octo/fixture').installed, false);
  assert.throws(() => core.startJob('octo/fixture', 'deps'), /no está instalado/);
});
