// Servidor MCP (stdio) para operar el catálogo desde Claude Code. Sin dependencias: JSON-RPC por líneas.
import readline from 'node:readline';
import {
  addMany, listRepos, listCategories, getView, updateRepo, removeRepo, uninstallRepo,
  startJob, stopJob, stopAll, waitJob, readLog, checkUpdate, checkAll, createDemo,
} from './core.mjs';

const repoProp = { type: 'string', description: 'URL de GitHub o "owner/repo"' };
const str = (description) => ({ type: 'string', description });

// Vista compacta para no gastar contexto.
const brief = (v) => ({
  repo: v.fullName,
  description: v.description,
  category: v.category,
  tags: v.tags,
  language: v.language,
  stars: v.stars,
  status: v.status,
  verdict: v.verdict,
  notes: v.notes,
  hasDemo: v.hasDemo,
  ...(v.liveUrl && { liveUrl: v.liveUrl }),
  ...(v.localPath && { localPath: v.localPath }),
});

async function launch(repo, kind) {
  startJob(repo, kind);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const v = getView(repo);
    if (v.liveUrl || v.job?.state !== 'running') break;
  }
  const v = getView(repo);
  return { status: v.status, liveUrl: v.liveUrl || null, log: readLog(repo, 40) };
}

const tools = [
  {
    name: 'add_repos',
    description: 'Agrega repos de GitHub al catálogo (una o varias URLs). Consulta GitHub para traer descripción, lenguaje, estrellas y topics. Asigna siempre una category: primero mira list_categories y reutiliza una existente si encaja.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: str('Una o varias URLs de GitHub, separadas por espacios o saltos de línea'),
        category: str('Categoría del catálogo'),
        tags: { type: 'array', items: { type: 'string' } },
        notes: str('Por qué le interesa al usuario'),
        installPath: str('Solo con UNA url: carpeta de un clon que ya existe en el disco, para registrarlo en su sitio sin moverlo'),
        installCmd: str('"-" = nunca reinstalar (clones que ya funcionan)'),
        runCmd: str('Comando para levantarlo, ejecutado dentro de la carpeta del repo'),
      },
      required: ['urls'],
    },
    run: async (a) => {
      const r = await addMany(a.urls, a);
      return { added: r.added.map(brief), alreadyInCatalog: r.existing.map(brief), errors: r.errors };
    },
  },
  {
    name: 'list_repos',
    description: 'Lista o busca repos del catálogo. query busca en nombre, descripción, categoría, tags, topics y notas.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        category: { type: 'string' },
        status: str('sin-instalar | instalado | actualizacion-disponible | ejecutando | fallo | funciona | no-funciona | sin-probar'),
      },
    },
    run: async (a) => listRepos({ q: a.query, category: a.category, status: a.status }).map(brief),
  },
  { name: 'list_categories', description: 'Categorías existentes con su cantidad de repos.', inputSchema: { type: 'object', properties: {} }, run: async () => listCategories() },
  { name: 'get_repo', description: 'Detalle completo de un repo (comandos, estado de instalación, último trabajo).', inputSchema: { type: 'object', properties: { repo: repoProp }, required: ['repo'] }, run: async (a) => getView(a.repo) },
  {
    name: 'update_repo',
    description: 'Edita categoría, tags, notas, veredicto (sin-probar | funciona | no-funciona) o los comandos de instalación/prueba de un repo.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: repoProp,
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        verdict: { type: 'string', enum: ['sin-probar', 'funciona', 'no-funciona'] },
        installCmd: str('Comando de instalación; vacío = automático'),
        runCmd: str('Comando para levantar el repo; vacío = automático'),
      },
      required: ['repo'],
    },
    run: async ({ repo, ...patch }) => brief(updateRepo(repo, patch)),
  },
  {
    name: 'remove_repo',
    description: 'Quita un repo del catálogo. Con delete_files también borra su carpeta instalada; con delete_demo, además, la demo propia del usuario (data/demos). Pide confirmación al usuario antes de usarla.',
    inputSchema: { type: 'object', properties: { repo: repoProp, delete_files: { type: 'boolean' }, delete_demo: { type: 'boolean' } }, required: ['repo'] },
    run: async (a) => removeRepo(a.repo, { deleteFiles: !!a.delete_files, deleteDemo: !!a.delete_demo }),
  },
  {
    name: 'uninstall_repo',
    description: 'Desinstala un repo: borra su clon (con .venv, node_modules…) pero lo deja en el catálogo con su demo y notas. Pide confirmación al usuario antes de usarla.',
    inputSchema: { type: 'object', properties: { repo: repoProp }, required: ['repo'] },
    run: async (a) => brief(uninstallRepo(a.repo)),
  },
  {
    name: 'install_repo',
    description: 'Clona el repo en repos/ y ejecuta su instalación de dependencias. Ejecuta código de terceros: solo cuando el usuario lo pida. Espera a que termine (hasta 10 min).',
    inputSchema: { type: 'object', properties: { repo: repoProp }, required: ['repo'] },
    run: async (a) => finished(startJob(a.repo, 'install'), a.repo, 600000),
  },
  {
    name: 'update_installed_repo',
    description: 'Trae los últimos cambios de un repo instalado (git pull) y reinstala dependencias.',
    inputSchema: { type: 'object', properties: { repo: repoProp }, required: ['repo'] },
    run: async (a) => finished(startJob(a.repo, 'update'), a.repo, 600000),
  },
  {
    name: 'run_repo',
    description: 'Levanta el repo instalado para probarlo. Devuelve la URL de la demo cuando el servidor la anuncia, y el final del registro. Se queda corriendo hasta stop_repo.',
    inputSchema: { type: 'object', properties: { repo: repoProp }, required: ['repo'] },
    run: async (a) => launch(a.repo, 'run'),
  },
  {
    name: 'create_demo',
    description: 'Crea la demo propia del usuario para un repo: su prueba, en data/demos/<owner__name>/ (fuera del clon). Pasa files {ruta: contenido} con el HTML/scripts de la prueba; sin files crea una plantilla "por armar" (con un prompt para pegarle a Claude); si la plantilla ya existe, reemplaza sus archivos escribiéndolos directo en esa carpeta. Con index.html se sirve sola; para algo más, incluye demo.json {"run": "comando"} (el comando recibe REPO_DIR con la carpeta del repo instalado y PORT). No pisa archivos existentes.',
    inputSchema: { type: 'object', properties: { repo: repoProp, files: { type: 'object', additionalProperties: { type: 'string' } } }, required: ['repo'] },
    run: async (a) => createDemo(a.repo, a.files),
  },
  {
    name: 'run_demo',
    description: 'Levanta la demo propia del repo y devuelve su URL. Se queda corriendo hasta stop_repo.',
    inputSchema: { type: 'object', properties: { repo: repoProp }, required: ['repo'] },
    run: async (a) => launch(a.repo, 'demo'),
  },
  { name: 'stop_repo', description: 'Detiene la ejecución (o instalación) en curso de un repo.', inputSchema: { type: 'object', properties: { repo: repoProp }, required: ['repo'] }, run: async (a) => ({ job: stopJob(a.repo)?.state ?? 'sin trabajo' }) },
  { name: 'stop_all', description: 'Bandera a cuadros: detiene todo lo que está corriendo (repos y demos "en pista"). Úsala al terminar de probar varias cosas.', inputSchema: { type: 'object', properties: {} }, run: async () => stopAll() },
  {
    name: 'check_updates',
    description: 'Consulta GitHub por cambios (metadatos y commits nuevos de los instalados). Sin repo, revisa todo el catálogo.',
    inputSchema: { type: 'object', properties: { repo: repoProp } },
    run: async (a) => (a.repo ? brief(await checkUpdate(a.repo)) : (await checkAll()).map(brief)),
  },
  { name: 'repo_log', description: 'Últimas líneas del registro del último trabajo de un repo.', inputSchema: { type: 'object', properties: { repo: repoProp, lines: { type: 'number' } }, required: ['repo'] }, run: async (a) => ({ log: readLog(a.repo, a.lines || 80) }) },
];

async function finished(_started, repo, timeoutMs) {
  const job = await waitJob(repo, timeoutMs);
  return { result: job.state, exitCode: job.exitCode ?? null, log: readLog(repo, 30) };
}

// ---------- JSON-RPC ----------

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

async function handle({ id, method, params }) {
  if (method === 'initialize') {
    return send({
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'repoteca', version: '0.1.0' },
      },
    });
  }
  if (method === 'ping') return send({ id, result: {} });
  if (method === 'tools/list') {
    return send({ id, result: { tools: tools.map(({ run, ...t }) => t) } });
  }
  if (method === 'tools/call') {
    const tool = tools.find((t) => t.name === params?.name);
    if (!tool) return send({ id, error: { code: -32602, message: `Herramienta desconocida: ${params?.name}` } });
    try {
      const out = await tool.run(params.arguments || {});
      return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] } });
    } catch (e) {
      return send({ id, result: { isError: true, content: [{ type: 'text', text: e.message }] } });
    }
  }
  if (id !== undefined) send({ id, error: { code: -32601, message: `Método no soportado: ${method}` } });
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  try {
    handle(JSON.parse(line));
  } catch (e) {
    console.error('mensaje inválido:', e.message);
  }
});
