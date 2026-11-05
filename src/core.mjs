// Núcleo compartido por la UI web y el servidor MCP:
// catálogo, metadatos de GitHub y ciclo de vida de cada repo (instalar, probar, actualizar).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Todo lo tuyo vive en una sola carpeta (catálogo, clones, demos, registros): respáldala o muévela con REPOTECA_DATA.
const DATA = process.env.REPOTECA_DATA ? path.resolve(process.env.REPOTECA_DATA) : path.join(ROOT, 'data');
const CATALOG = path.join(DATA, 'catalog.json');
const JOBS = path.join(DATA, 'jobs');
const LOGS = path.join(DATA, 'logs');
export const REPOS = path.join(DATA, 'repos');
const DEMOS = path.join(DATA, 'demos');

const VERDICTS = ['sin-probar', 'funciona', 'no-funciona'];

// ---------- catálogo (un JSON legible) ----------

function readCatalog() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { repos: [] };
    throw e;
  }
}

function writeCatalog(c) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = CATALOG + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, CATALOG);
}

function mutate(id, fn) {
  const c = readCatalog();
  const repo = c.repos.find((r) => r.id === id);
  if (!repo) throw new Error(`No está en el catálogo: ${id}`);
  fn(repo);
  writeCatalog(c);
  return repo;
}

// ---------- referencias y GitHub ----------

export function parseRepoRef(input) {
  const s = String(input).trim();
  const m =
    s.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i) ||
    s.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? { owner: m[1], name: m[2] } : null;
}

export function resolveId(ref) {
  const p = parseRepoRef(ref);
  if (!p) throw new Error(`No es una URL o "owner/repo" de GitHub: ${ref}`);
  return `${p.owner}/${p.name}`.toLowerCase();
}

async function gh(pathname) {
  const headers = { 'User-Agent': 'repoteca', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch('https://api.github.com' + pathname, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    const e = new Error(r.status === 403 ? 'GitHub: límite de consultas (define GITHUB_TOKEN)' : `GitHub respondió ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

const metaFrom = (j) => ({
  fullName: j.full_name,
  description: j.description || '',
  language: j.language || '',
  stars: j.stargazers_count ?? 0,
  topics: j.topics || [],
  license: j.license?.spdx_id || '',
  defaultBranch: j.default_branch || '',
  pushedAt: j.pushed_at || '',
  archived: !!j.archived,
  homepage: j.homepage || '',
});

const tagList = (t) =>
  (Array.isArray(t) ? t : String(t ?? '').split(','))
    .map((x) => String(x).trim())
    .filter(Boolean);

// ---------- CRUD ----------

export async function addRepo(input, extra = {}) {
  const ref = parseRepoRef(input);
  if (!ref) throw new Error(`No es una URL de GitHub: ${input}`);
  const id = `${ref.owner}/${ref.name}`.toLowerCase();
  // Repoteca dentro de Repoteca: no.
  if (ref.name.toLowerCase() === 'repoteca') throw Object.assign(new Error('En serio amig@? Pa qué? Meterías un garage dentro de un garage?'), { self: true });

  const existingBefore = readCatalog().repos.find((r) => r.id === id);
  if (existingBefore) return { repo: view(existingBefore), created: false };

  let meta;
  let metaError = '';
  try {
    meta = metaFrom(await gh(`/repos/${ref.owner}/${ref.name}`));
  } catch (e) {
    if (e.status === 404) throw new Error(`No existe o es privado (¿falta GITHUB_TOKEN?): ${ref.owner}/${ref.name}`);
    metaError = e.message;
    meta = { fullName: `${ref.owner}/${ref.name}`, description: '', language: '', stars: 0, topics: [], license: '', defaultBranch: '', pushedAt: '', archived: false, homepage: '' };
  }

  // GitHub devuelve el nombre canónico (los repos renombrados o movidos de org redirigen).
  const canonical = meta.fullName.toLowerCase();
  const c = readCatalog();
  const existing = c.repos.find((r) => r.id === canonical);
  if (existing) return { repo: view(existing), created: false };

  let installPath = '';
  if (extra.installPath) {
    installPath = path.resolve(extra.installPath);
    if (!fs.existsSync(path.join(installPath, '.git'))) throw new Error(`No es un clon de git: ${installPath}`);
  }

  const repo = {
    id: canonical,
    installPath,
    url: `https://github.com/${meta.fullName}.git`,
    ...meta,
    category: extra.category?.trim() || '',
    tags: tagList(extra.tags),
    notes: extra.notes?.trim() || '',
    verdict: 'sin-probar',
    installCmd: extra.installCmd || '',
    runCmd: extra.runCmd || '',
    remoteSha: '',
    metaError,
    addedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
  };
  c.repos.push(repo);
  writeCatalog(c);
  return { repo: view(repo), created: true };
}

// Acepta varias URLs pegadas juntas (separadas por espacios o saltos de línea).
export async function addMany(text, extra = {}) {
  const parts = String(text).split(/\s+/).filter(Boolean);
  const refs = parts.filter(parseRepoRef);
  if (!refs.length) throw new Error('No encontré ninguna URL de GitHub en el texto.');
  const out = { added: [], existing: [], errors: [], self: [] };
  for (const ref of refs) {
    try {
      const { repo, created } = await addRepo(ref, extra);
      (created ? out.added : out.existing).push(repo);
    } catch (e) {
      // El aviso de "garage dentro de un garage" lo muestra la UI aparte; para el resto es un error normal.
      if (e.self) out.self.push(ref);
      out.errors.push({ ref, error: e.message });
    }
  }
  return out;
}

export function getRepo(ref) {
  const id = resolveId(ref);
  const repo = readCatalog().repos.find((r) => r.id === id);
  if (!repo) throw new Error(`No está en el catálogo: ${id}`);
  return repo;
}

export function getView(ref) {
  return view(getRepo(ref));
}

export function updateRepo(ref, patch) {
  const id = getRepo(ref).id;
  return view(
    mutate(id, (r) => {
      if ('category' in patch) r.category = String(patch.category).trim();
      if ('tags' in patch) r.tags = tagList(patch.tags);
      if ('notes' in patch) r.notes = String(patch.notes);
      if ('installCmd' in patch) r.installCmd = String(patch.installCmd).trim();
      if ('runCmd' in patch) r.runCmd = String(patch.runCmd).trim();
      if ('verdict' in patch) {
        if (!VERDICTS.includes(patch.verdict)) throw new Error(`verdict debe ser: ${VERDICTS.join(', ')}`);
        r.verdict = patch.verdict;
      }
    }),
  );
}

// Borra una carpeta y comprueba que de verdad desapareció (en Windows un archivo en uso puede impedirlo).
function wipe(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  if (fs.existsSync(dir)) throw new Error(`No pude borrar todo en ${dir} (¿algo lo está usando?). Detén el repo y reintenta.`);
}

// Solo se borran clones que Repoteca instaló (dentro de data/repos); uno que registraste en otra carpeta nunca se toca.
const ownsClone = (repo) => !path.relative(REPOS, localDir(repo)).startsWith('..');

// Quita el repo del catálogo. deleteFiles borra el clon; deleteDemo borra tu demo propia (data/demos).
export function removeRepo(ref, { deleteFiles = false, deleteDemo = false } = {}) {
  const repo = getRepo(ref);
  stopJob(repo.id);
  const owned = ownsClone(repo);
  if (deleteFiles && owned) wipe(localDir(repo));
  if (deleteDemo) wipe(demoDir(repo));
  const c = readCatalog();
  c.repos = c.repos.filter((r) => r.id !== repo.id);
  writeCatalog(c);
  for (const f of [jobFile(repo.id), logFile(repo.id)]) fs.rmSync(f, { force: true });
  return { removed: repo.id, filesDeleted: deleteFiles && owned, demoDeleted: deleteDemo, demoKept: !deleteDemo && fs.existsSync(demoDir(repo)) };
}

// Desinstalar: borra el clon (y su .venv, node_modules…) pero el repo sigue en el catálogo, con tu demo y tus notas.
export function uninstallRepo(ref) {
  const repo = getRepo(ref);
  const dir = localDir(repo);
  if (!fs.existsSync(path.join(dir, '.git'))) throw new Error('No está instalado.');
  if (!ownsClone(repo)) throw new Error(`Este clon está en ${dir} y no lo instaló Repoteca: no lo borra. Bórralo a mano o quítalo del catálogo.`);
  stopJob(repo.id);
  wipe(dir);
  for (const f of [jobFile(repo.id), logFile(repo.id)]) fs.rmSync(f, { force: true });
  return view(repo);
}

export function listRepos({ q = '', category = '', status = '' } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return readCatalog()
    .repos.map(view)
    .filter((v) => {
      if (category && v.category.toLowerCase() !== category.toLowerCase()) return false;
      if (status && v.status !== status && v.verdict !== status) return false;
      const hay = [v.fullName, v.description, v.category, v.language, v.notes, ...v.tags, ...v.topics].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function listCategories() {
  const counts = {};
  for (const r of readCatalog().repos) {
    if (r.category) counts[r.category] = (counts[r.category] || 0) + 1;
  }
  return counts;
}

// ---------- estado local ----------

const slug = (id) => id.replace('/', '__');
export const localDir = (repo) => repo.installPath || path.join(REPOS, slug(repo.id));
export const demoDir = (repo) => path.join(DEMOS, slug(repo.id));
const jobFile = (id) => path.join(JOBS, slug(id) + '.json');
export const logFile = (id) => path.join(LOGS, slug(id) + '.log');

function readHead(dir) {
  try {
    const head = fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head;
    const ref = head.slice(5);
    try {
      return fs.readFileSync(path.join(dir, '.git', ref), 'utf8').trim();
    } catch {
      const packed = fs.readFileSync(path.join(dir, '.git', 'packed-refs'), 'utf8');
      return packed.split('\n').find((l) => l.endsWith(' ' + ref))?.split(' ')[0] || '';
    }
  } catch {
    return '';
  }
}

// Comandos por defecto según lo que haya en el repo; los del catálogo tienen prioridad.
function detectCommands(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (has('package.json')) {
    let scripts = {};
    try {
      scripts = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts || {};
    } catch {}
    const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm';
    return { kind: 'node', installCmd: `${pm} install`, runCmd: scripts.dev ? `${pm} run dev` : scripts.start ? `${pm} start` : '' };
  }
  if (has('requirements.txt') || has('pyproject.toml')) {
    const py = process.platform === 'win32' ? '.venv\\Scripts\\python' : '.venv/bin/python';
    const dep = has('requirements.txt') ? '-r requirements.txt' : '-e .';
    const entry = ['app.py', 'main.py'].find(has);
    return { kind: 'python', installCmd: `python -m venv .venv && ${py} -m pip install ${dep}`, runCmd: entry ? `${py} ${entry}` : '' };
  }
  if (has('Cargo.toml')) return { kind: 'rust', installCmd: 'cargo build', runCmd: 'cargo run' };
  if (has('go.mod')) return { kind: 'go', installCmd: 'go build ./...', runCmd: 'go run .' };
  if (has('index.html')) return { kind: 'static', installCmd: '', runCmd: `node "${path.join(ROOT, 'src', 'static.mjs')}"` };
  return { kind: '', installCmd: '', runCmd: '' };
}

export function effectiveCommands(repo, dir) {
  const d = detectCommands(dir);
  // installCmd "-" = no reinstalar nunca (útil para clones adoptados que ya funcionan).
  const installCmd = repo.installCmd === '-' ? '' : repo.installCmd || d.installCmd;
  return { installCmd, runCmd: repo.runCmd || d.runCmd, detected: d.kind };
}

// ---------- demo propia ----------
// Es tu prueba del repo: vive en data/demos/<owner__name>/, fuera del clon (actualizar no la toca).
// Si hay demo.json con {"run": "..."} se ejecuta ese comando (con REPO_DIR apuntando al clon); si no, se sirve index.html.

export function demoCommand(repo) {
  const dir = demoDir(repo);
  try {
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'demo.json'), 'utf8')).run;
    if (run) return run;
  } catch {}
  return fs.existsSync(path.join(dir, 'index.html')) ? `node "${path.join(ROOT, 'src', 'static.mjs')}"` : '';
}

export function demoEnv(repo) {
  const dir = localDir(repo);
  return fs.existsSync(path.join(dir, '.git')) ? { REPO_DIR: dir } : {};
}

// La plantilla lleva esta marca; mientras siga ahí, la card avisa que la demo está por armar.
const TEMPLATE_MARK = '<!-- repoteca:plantilla -->';

export function demoIsTemplate(repo) {
  const dir = demoDir(repo);
  if (fs.existsSync(path.join(dir, 'demo.json'))) return false;
  try {
    return fs.readFileSync(path.join(dir, 'index.html'), 'utf8').includes(TEMPLATE_MARK);
  } catch {
    return false;
  }
}

// Prompt listo para pegarle a Claude: con los datos concretos del repo (rutas, comandos, archivos) y cómo corre una demo en Repoteca.
function demoPrompt(repo) {
  const dir = demoDir(repo);
  const repoDir = localDir(repo);
  const installed = fs.existsSync(path.join(repoDir, '.git'));
  const lines = [`Arma mi demo de ${repo.fullName} dentro de ${dir}`, '', 'EL REPO'];
  const desc = repo.description.length > 160 ? repo.description.slice(0, 160).replace(/\s\S*$/, '') + '…' : repo.description;
  lines.push(`- ${repo.fullName}: ${desc || '(sin descripción)'}`);
  lines.push(`- ${repo.url.replace(/\.git$/, '')}${repo.language ? ` · ${repo.language}` : ''}`);
  if (installed) {
    const { installCmd, runCmd, detected } = effectiveCommands(repo, repoDir);
    lines.push(`- Instalado en: ${repoDir}`);
    if (detected) lines.push(`- Tipo detectado: ${detected}${installCmd ? ` · instalar: \`${installCmd}\`` : ''}${runCmd ? ` · ejecutar: \`${runCmd}\`` : ''}`);
    if (detected === 'python') lines.push(`- Python del repo (úsalo, no el del sistema): ${path.join(repoDir, '.venv', process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python')}`);
    try {
      const top = fs.readdirSync(repoDir).filter((n) => !n.startsWith('.')).slice(0, 30);
      lines.push(`- Raíz del repo: ${top.join(', ')}`);
    } catch {}
    const extras = ['examples', 'example', 'samples', 'demo', 'docs'].filter((n) => fs.existsSync(path.join(repoDir, n)));
    if (extras.length) lines.push(`- Ejemplos/documentación útiles dentro del repo: ${extras.join(', ')}`);
    lines.push(`- Lee primero ${path.join(repoDir, 'README.md')}.`);
  } else {
    lines.push(`- Aún NO está instalado (Repoteca lo clonaría en ${repoDir}). Si la demo necesita el código, instálalo primero desde Repoteca.`);
  }
  if (repo.topics?.length) lines.push(`- Temas: ${repo.topics.slice(0, 8).join(', ')}`);
  lines.push(
    '',
    'QUÉ QUIERO',
    'Una demo que me deje entender y probar este repo en menos de un minuto, sin leer nada antes:',
    '1. Elige UN caso de uso: el más representativo según el README y el más simple de mostrar. Descarta lo que exija GPU, claves de API, cuentas o descargas pesadas; si es inevitable, haz una versión reducida y dilo en la propia página.',
    '2. Que ejecute el repo de verdad (su código, su CLI o su librería). Nada de maquetas ni resultados inventados.',
    '3. Autoexplicativa: título con el nombre del repo y una frase de qué es; una línea de «qué estás viendo»; entradas con un ejemplo ya cargado para que el primer clic funcione sin configurar nada; el resultado visible al instante.',
    '4. Errores claros: si falta algo (dependencia, comando, red), la página debe decir qué falta y cómo arreglarlo, no quedarse en blanco.',
    '5. Una sola pantalla, compacta, oscura, en español, sin dependencias ni build.',
    '',
    'CÓMO CORRE UNA DEMO EN REPOTECA',
    `- Reemplaza el index.html de ${dir} (es solo esta plantilla). No modifiques la carpeta del repo.`,
    '- Si basta una página estática, deja solo index.html: se sirve sola.',
    '- Si necesita ejecutar algo: crea server.mjs (Node, sin dependencias) y demo.json con {"run": "node server.mjs"}. El comando corre dentro de la carpeta de la demo con PORT (escucha en 127.0.0.1:PORT) y REPO_DIR (= la carpeta del repo instalado); al arrancar imprime http://127.0.0.1:<PORT>. El servidor llama al repo (por ejemplo con child_process) y devuelve el resultado a la página.',
    '',
    'AL TERMINAR',
    '- Pruébala tú: run_demo del MCP repoteca, abre la página y comprueba que sin tocar nada ya muestra un resultado real; si algo falla, repo_log. Detén el proceso con stop_repo.',
    '- Dime en 3 líneas qué muestra y cómo la pruebo. Yo la reviso con «Ver demo» en Repoteca.',
  );
  return lines.join('\n');
}

const DEMO_TEMPLATE = (repo) => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html>
${TEMPLATE_MARK}
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo · ${esc(repo.fullName)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
html{background:#0d0f14}
body{margin:0;padding:24px 22px 28px;font:14px/1.55 system-ui,sans-serif;color:#e8ebf2;background:#0d0f14}
.tag{font:600 10px ui-monospace,monospace;letter-spacing:.18em;color:#b58cff}
h1{font-size:20px;margin:4px 0 6px}
p{margin:0 0 14px;color:#9aa1b4}p b{color:#e8ebf2}
pre{margin:0;padding:14px;max-height:56vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.6 ui-monospace,Consolas,monospace;color:#d5d9e4;background:#151922;border:1px solid #262c3a;border-radius:10px}
.row{display:flex;align-items:center;gap:12px;margin-top:12px}
button{padding:9px 18px;font:700 13px system-ui;cursor:pointer;color:#fff;background:#d10600;border:0;border-radius:8px}
button:hover{filter:brightness(1.12)}
.mut{color:#6ee7b7;font-size:13px}
</style></head>
<body>
<span class="tag">DEMO POR ARMAR</span>
<h1>${esc(repo.fullName)}</h1>
<p>Esta es solo una plantilla: aún no hay una demo de verdad. Pégale este prompt a Claude (en esta carpeta de Repoteca) para que la arme, y cuando termine vuelve a pulsar <b>Ver demo</b>.</p>
<pre id="p">${esc(demoPrompt(repo))}</pre>
<div class="row"><button id="c">Copiar prompt</button><span id="ok" class="mut"></span></div>
<script>
document.getElementById('c').onclick = async () => {
  const t = document.getElementById('p').textContent;
  try { await navigator.clipboard.writeText(t); } catch {
    const r = document.createRange(); r.selectNodeContents(document.getElementById('p'));
    getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy');
  }
  document.getElementById('ok').textContent = '¡Copiado!';
};
</script>
</body></html>
`;
};

// files: { "ruta/relativa": "contenido" }. Sin files crea una plantilla. Nunca pisa lo que ya existe.
export function createDemo(ref, files) {
  const repo = getRepo(ref);
  const dir = demoDir(repo);
  const entries = Object.entries(files && Object.keys(files).length ? files : { 'index.html': DEMO_TEMPLATE(repo) });
  const created = [];
  for (const [rel, content] of entries) {
    const target = path.resolve(dir, rel);
    if (path.relative(dir, target).startsWith('..') || path.isAbsolute(rel)) throw new Error(`Ruta fuera de la demo: ${rel}`);
    if (fs.existsSync(target)) throw new Error(`Ya existe ${rel}; edítalo directamente en ${dir}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    created.push(rel);
  }
  return { path: dir, created };
}

export function reveal(ref, what) {
  const repo = getRepo(ref);
  const dir = what === 'demo' ? demoDir(repo) : localDir(repo);
  if (!fs.existsSync(dir)) throw new Error('Esa carpeta todavía no existe.');
  const [cmd, args] = process.platform === 'win32' ? ['explorer', [dir]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [dir]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  return { opened: dir };
}

function statusOf(v) {
  const j = v.job;
  if (j?.state === 'running') return { install: 'instalando', update: 'actualizando', run: 'ejecutando', demo: 'ejecutando' }[j.kind];
  if (j?.state === 'failed' || j?.state === 'interrupted') return 'fallo';
  if (!v.installed) return 'sin-instalar';
  return v.updateAvailable ? 'actualizacion-disponible' : 'instalado';
}

function view(repo) {
  const dir = localDir(repo);
  const installed = fs.existsSync(path.join(dir, '.git'));
  const head = installed ? readHead(dir) : '';
  const job = readJob(repo.id);
  const v = {
    ...repo,
    installed,
    head,
    updateAvailable: !!(installed && repo.remoteSha && head && repo.remoteSha !== head),
    job,
    commands: installed ? effectiveCommands(repo, dir) : { installCmd: '', runCmd: '', detected: '' },
    localPath: installed ? dir : '',
    managed: !repo.installPath, // el clon lo creó Repoteca (se puede borrar); si no, es uno adoptado
    hasDemo: !!demoCommand(repo),
    demoPending: demoIsTemplate(repo),
    demoPath: demoDir(repo),
    liveKind: job?.state === 'running' && ['run', 'demo'].includes(job.kind) ? job.kind : '',
    liveUrl: job?.state === 'running' && ['run', 'demo'].includes(job.kind) && job.port ? `http://localhost:${job.port}/` : '',
  };
  v.status = statusOf(v);
  return v;
}

// ---------- trabajos (instalar / actualizar / ejecutar) ----------
// Cada trabajo corre en un proceso aparte (runner.mjs) que escribe su estado en data/jobs.
// Así la UI y el MCP ven lo mismo y los procesos sobreviven a reinicios del servidor.

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

export function readJob(id) {
  let j;
  try {
    j = JSON.parse(fs.readFileSync(jobFile(id), 'utf8'));
  } catch {
    return null;
  }
  if (!j.endedAt) j.state = alive(j.pid) ? 'running' : 'interrupted';
  else j.state = j.stopped ? 'stopped' : j.exitCode === 0 ? 'ok' : 'failed';
  return j;
}

export function patchJob(id, patch) {
  try {
    const j = JSON.parse(fs.readFileSync(jobFile(id), 'utf8'));
    fs.writeFileSync(jobFile(id), JSON.stringify({ ...j, ...patch }));
  } catch {}
}

export function startJob(ref, kind) {
  const repo = getRepo(ref);
  if (readJob(repo.id)?.state === 'running') throw new Error('Ya hay un trabajo en curso para este repo.');
  const installed = fs.existsSync(path.join(localDir(repo), '.git'));
  if (kind === 'demo') {
    if (!demoCommand(repo)) throw new Error('Este repo no tiene demo propia todavía: créala primero.');
  } else if (kind === 'install') {
    if (installed) throw new Error('Ya está instalado (usa actualizar).');
  } else if (!installed) throw new Error('El repo no está instalado.');
  if (kind === 'run' && !effectiveCommands(repo, localDir(repo)).runCmd) {
    throw new Error('No hay comando para ejecutarlo: define "runCmd" en el repo.');
  }
  fs.mkdirSync(JOBS, { recursive: true });
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(logFile(repo.id), '');
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'runner.mjs'), repo.id, kind], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  fs.writeFileSync(jobFile(repo.id), JSON.stringify({ kind, pid: child.pid, startedAt: new Date().toISOString(), port: null }));
  return readJob(repo.id);
}

export function stopJob(ref) {
  const id = resolveId(ref);
  const j = readJob(id);
  if (j?.state !== 'running') return j;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(j.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-j.pid, 'SIGTERM');
  } catch {}
  patchJob(id, { endedAt: new Date().toISOString(), stopped: true });
  return readJob(id);
}

export async function waitJob(ref, timeoutMs) {
  const id = resolveId(ref);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (readJob(id)?.state !== 'running') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return readJob(id);
}

export function readLog(ref, tail = 200) {
  try {
    const text = fs.readFileSync(logFile(resolveId(ref)), 'utf8').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    return text.split('\n').slice(-tail).join('\n');
  } catch {
    return '';
  }
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// ---------- actualizaciones ----------

export async function checkUpdate(ref) {
  const repo = getRepo(ref);
  const dir = localDir(repo);
  let meta = null;
  let metaError = '';
  try {
    meta = metaFrom(await gh(`/repos/${repo.fullName}`));
  } catch (e) {
    metaError = e.message;
  }
  let remoteSha = repo.remoteSha;
  if (fs.existsSync(path.join(dir, '.git'))) {
    try {
      const { stdout } = await exec('git', ['ls-remote', 'origin', 'HEAD'], { cwd: dir, timeout: 30000 });
      remoteSha = stdout.split(/\s/)[0] || remoteSha;
    } catch (e) {
      metaError ||= 'git ls-remote falló: ' + e.message.split('\n')[0];
    }
  }
  mutate(repo.id, (r) => {
    if (meta) Object.assign(r, meta);
    r.remoteSha = remoteSha;
    r.metaError = metaError;
    r.checkedAt = new Date().toISOString();
  });
  return getView(repo.id);
}

export async function checkAll() {
  for (const r of readCatalog().repos) {
    try {
      await checkUpdate(r.id);
    } catch {}
  }
  return listRepos();
}
