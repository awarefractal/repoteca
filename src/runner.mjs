// Proceso desacoplado que ejecuta un trabajo de un repo: node runner.mjs <owner/name> <install|update|deps|run|demo> [--safe]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { ROOT, REPOS, getRepo, localDir, demoDir, demoCommand, demoEnv, effectiveCommands, patchJob, markDeps, logFile, freePort } from './core.mjs';

const [id, kind, flag] = process.argv.slice(2);
const safe = flag === '--safe';
const repo = getRepo(id);
const dir = localDir(repo);
const log = fs.createWriteStream(logFile(id), { flags: 'a' });
let port = null;

function sh(cmd, cwd, env = {}) {
  return new Promise((resolve) => {
    log.write(`\n$ ${cmd}\n`);
    const p = spawn(cmd, { shell: true, cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const onData = (b) => {
      log.write(b);
      if (port) return;
      const m = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)/.exec(b.toString().replace(/\x1b\[[0-9;]*m/g, ''));
      if (m) patchJob(id, { port: (port = +m[1]) });
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', (e) => {
      log.write(`${e}\n`);
      resolve(1);
    });
    p.on('close', (code) => resolve(code ?? 1));
  });
}

const head = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

let code = 0;
if (kind === 'install' || kind === 'update') {
  let changed = true;
  if (kind === 'install') {
    fs.mkdirSync(REPOS, { recursive: true });
    code = await sh(`git clone --depth 1 "${repo.url}" "${dir}"`, ROOT);
  } else {
    const before = head();
    code = await sh('git pull --ff-only', dir);
    changed = head() !== before;
  }
  const installCmd = code === 0 ? effectiveCommands(repo, dir).installCmd : '';
  if (installCmd && safe) {
    // Modo seguro: clonar o traer cambios no ejecuta código del repo; las dependencias esperan la confirmación del usuario.
    if (changed) markDeps(id, true);
    log.write(changed ? '\n[modo seguro] Dependencias sin instalar: confirma el comando para ejecutarlo.\n' : '\n[sin cambios nuevos: no hace falta reinstalar]\n');
  } else if (installCmd) {
    code = await sh(installCmd, dir);
    if (code === 0) markDeps(id, false);
  }
} else if (kind === 'deps') {
  const { installCmd } = effectiveCommands(repo, dir);
  code = installCmd ? await sh(installCmd, dir) : 0;
  if (code === 0) markDeps(id, false);
} else if (kind === 'run') {
  const { runCmd } = effectiveCommands(repo, dir);
  code = await sh(runCmd, dir, { PORT: String(await freePort()), BROWSER: 'none' });
} else if (kind === 'demo') {
  code = await sh(demoCommand(repo), demoDir(repo), { ...demoEnv(repo), PORT: String(await freePort()), BROWSER: 'none' });
} else {
  log.write(`Trabajo desconocido: ${kind}\n`);
  code = 1;
}

log.write(`\n[terminó con código ${code}]\n`);
log.end(() => {
  patchJob(id, { endedAt: new Date().toISOString(), exitCode: code });
  process.exit(0);
});
