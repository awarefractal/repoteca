const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { repos: [], q: '', cat: '', status: '', drawerId: null, tab: 'demo', snapshot: '', teams: {}, open: new Set() };

// Barras inclinadas, como las del logo y las de un trazado de telemetría.
const METRICS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><g transform="translate(5 0) skewX(-14)"><rect x="1.5" y="14" width="3.2" height="7" rx=".7"/><rect x="6.5" y="9" width="3.2" height="12" rx=".7"/><rect x="11.5" y="4" width="3.2" height="17" rx=".7"/><rect x="16.5" y="11" width="3.2" height="10" rx=".7"/></g></svg>';
const WRENCH ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';

// Cada repo tiene "su" circuito (siempre el mismo, según su id): dibujos de public/circuits.js.
function trackIcon(id) {
  const list = window.CIRCUITS || [];
  if (!list.length) return '';
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [, d] = list[h % list.length];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = Object.assign(document.createElement('textarea'), { value: text });
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.append(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    if (!ok) throw new Error('No pude copiar al portapapeles.');
  }
}

// Cada categoría corre con una escudería: [color principal, secundario, color del texto encima]
const TEAMS = [
  ['#e8002d', '#ff6a3c', '#fff'], // Ferrari
  ['#27f4d2', '#00a19c', '#000'], // Mercedes
  ['#3671c6', '#ffd400', '#fff'], // Red Bull
  ['#ff8000', '#ffc04d', '#000'], // McLaren
  ['#229971', '#7cf0b8', '#fff'], // Aston Martin
  ['#0093cc', '#ff87bc', '#fff'], // Alpine
  ['#64c4ff', '#005aff', '#000'], // Williams
  ['#6692ff', '#ff3b3b', '#fff'], // Racing Bulls
  ['#52e252', '#e8002d', '#000'], // Audi
];
const SILVER = ['#b6babd', '#e8002d', '#000']; // Haas: sin categoría

const STATUS_FILTERS = {
  'sin-instalar': (v) => v.status === 'sin-instalar',
  instalado: (v) => v.installed,
  'actualizacion-disponible': (v) => v.updateAvailable,
  ejecutando: (v) => v.status === 'ejecutando',
  funciona: (v) => v.verdict === 'funciona',
  'no-funciona': (v) => v.verdict === 'no-funciona',
  'sin-probar': (v) => v.verdict === 'sin-probar',
};

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// Cuadro de confirmación/aviso con el estilo de la app. Devuelve true si el usuario acepta.
// lines: textos sueltos o [texto, ruta] (la ruta se muestra aparte, en mono). no: null = solo aviso, sin cancelar.
function ask({ kind = 'CONFIRMAR', title, text = '', lines = [], yes = 'Aceptar', no = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    $('#aKind').textContent = kind;
    $('#aTitle').textContent = title;
    $('#aBody').innerHTML =
      (text ? `<p>${esc(text)}</p>` : '') +
      (lines.length ? `<ul>${lines.map((l) => (Array.isArray(l) ? `<li>${esc(l[0])}<code>${esc(l[1])}</code></li>` : `<li>${esc(l)}</li>`)).join('')}</ul>` : '');
    const yesBtn = $('#aYes');
    yesBtn.textContent = yes;
    yesBtn.className = `btn ${danger ? 'stop' : 'go'}`;
    $('#aNo').hidden = no === null;
    $('#aNo').textContent = no ?? '';
    const dlg = $('#ask');
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    yesBtn.focus();
  });
}

function flash(text) {
  $('#msgText').textContent = text;
  $('#msg').hidden = !text;
}

// ---------- datos ----------

const OFFLINE = 'Sin conexión con el servidor de Repoteca: probablemente se cerró su ventana. Ábrelo de nuevo con start.cmd (o npm start); esta página se reconecta sola.';

async function refresh() {
  try {
    const data = await api('/repos');
    if ($('#msgText').textContent === OFFLINE) flash('');
    const snap = JSON.stringify(data.repos);
    if (snap === state.snapshot) return;
    state.snapshot = snap;
    state.repos = data.repos;
    // escudería por orden de aparición: estable mientras no borres categorías
    state.teams = {};
    let n = 0;
    [...state.repos].sort((a, b) => a.addedAt.localeCompare(b.addedAt)).forEach((v) => {
      if (v.category && !(v.category in state.teams)) state.teams[v.category] = TEAMS[n++ % TEAMS.length];
    });
    render();
  } catch (e) {
    flash(e instanceof TypeError ? OFFLINE : 'No se pudo leer el catálogo: ' + e.message);
  }
}

async function act(path, opts) {
  try {
    flash('');
    await api(path, opts);
  } catch (e) {
    flash(e.message);
  }
  state.snapshot = '';
  await refresh();
}

// ---------- render ----------

const team = (v) => state.teams[v.category] || SILVER;
const teamStyle = ([t, t2, on]) => `--t:${t};--t2:${t2};--on:${on}`;

const ago = (iso) => {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso)) / 86400000;
  if (d < 1) return 'hoy';
  if (d < 30) return `${Math.floor(d)} d`;
  if (d < 365) return `${Math.floor(d / 30)} m`;
  return `${Math.floor(d / 365)} a`;
};

const LIGHTS = '<span class="lights"><i></i><i></i><i></i><i></i><i></i></span>';
const TIRE = '<span class="tire"></span>';
const led = '<span class="led"></span>';
const STATUS_BADGE = {
  instalando: ['var(--warn)', TIRE, 'Instalando…'],
  actualizando: ['var(--warn)', TIRE, 'Actualizando…'],
  ejecutando: ['var(--ok)', LIGHTS, 'En pista'],
  fallo: ['var(--bad)', led, 'Falló'],
  'actualizacion-disponible': ['var(--warn)', led, 'Actualización'],
  instalado: ['var(--ok)', led, 'Instalado'],
  'sin-instalar': ['var(--muted)', led, 'Sin instalar'],
};
const VERDICT_BADGE = { funciona: ['var(--violet)', led, 'Sector morado'], 'no-funciona': ['var(--bad)', led, 'No funciona'] };
const badge = ([c, icon, text]) => `<span class="badge" style="--c:${c}">${icon}${text}</span>`;

function visible() {
  const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const byStatus = STATUS_FILTERS[state.status];
  return state.repos.filter((v) => {
    if (state.cat && (v.category || '') !== (state.cat === '__none' ? '' : state.cat)) return false;
    if (byStatus && !byStatus(v)) return false;
    const hay = [v.fullName, v.description, v.category, v.language, v.notes, ...v.tags, ...v.topics].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

function renderTower() {
  const r = state.repos;
  const cells = [
    ['Repos', r.length, 'var(--text)', 'Todos los repos que tienes guardados en el catálogo.'],
    ['Instalados', r.filter((v) => v.installed).length, 'var(--ok)', 'Repos que ya están clonados en tu equipo y listos para probar.'],
    ['Sector morado', r.filter((v) => v.verdict === 'funciona').length, 'var(--violet)', 'Repos que probaste y marcaste como «Funciona». En F1, sector morado = el mejor tiempo.'],
    ['Actualizaciones', r.filter((v) => v.updateAvailable).length, 'var(--warn)', 'Repos instalados con cambios nuevos en GitHub. Usa «Buscar actualizaciones» para refrescar.'],
    ['En pista', r.filter((v) => v.status === 'ejecutando').length, 'var(--cyan)', 'Repos o demos que están corriendo ahora mismo.'],
  ];
  $('#tower').innerHTML = cells.map(([l, n, c, tip]) => `<div style="--c:${c}" data-tip="${esc(tip)}"><small>${l}</small><b>${String(n).padStart(2, '0')}</b></div>`).join('');
}

function renderCats() {
  const counts = {};
  for (const v of state.repos) counts[v.category || ''] = (counts[v.category || ''] || 0) + 1;
  const chips = [['', 'Parrilla completa', state.repos.length, SILVER]];
  Object.keys(counts).filter(Boolean).sort().forEach((c) => chips.push([c, c, counts[c], state.teams[c]]));
  if (counts['']) chips.push(['__none', 'Sin categoría', counts[''], SILVER]);
  if (state.cat && !chips.some(([k]) => k === state.cat)) state.cat = '';
  $('#cats').innerHTML = chips
    .map(([key, label, n, tm]) => `<button class="chip ${state.cat === key ? 'on' : ''}" style="${teamStyle(tm)}" data-cat="${esc(key)}">${esc(label)}<b>${n}</b></button>`)
    .join('');
}

function demoBand(v) {
  if (v.liveKind === 'demo') {
    return `<div class="demo-band live"><div class="label"><small>MI DEMO</small><strong>● En vivo</strong></div>
      <button class="btn sm demo" data-a="live">Ver</button><button class="btn sm stop" data-a="stop">Detener</button></div>`;
  }
  if (v.hasDemo) {
    return `<div class="demo-band"><div class="label"><small>MI DEMO</small><strong>${v.demoPending ? 'Por armar · ver prompt' : 'Lista para correr'}</strong></div>
      <button class="btn sm demo" data-a="demo">▶ Ver demo</button><button class="btn sm ghost" data-a="folder-demo">Carpeta</button></div>`;
  }
  return `<div class="demo-band"><div class="label"><small>MI DEMO</small><strong>Sin crear</strong></div>
    <button class="btn sm ghost" data-a="create-demo">+ Crear demo</button></div>`;
}

// Las estrellitas del título son relativas a lo que tienes instalado: el más popular lleva 7, el menos popular 1.
function starRank(v) {
  const pool = state.repos.filter((r) => r.installed);
  const stars = (pool.length ? pool : state.repos).map((r) => r.stars);
  const min = Math.min(...stars);
  const max = Math.max(...stars);
  if (max === min) return 7;
  return Math.max(1, Math.min(7, Math.round(1 + (6 * (v.stars - min)) / (max - min))));
}

function card(v, i) {
  const tm = team(v);
  const [owner, name] = v.fullName.split('/');
  const running = v.status === 'ejecutando';
  const busy = v.status === 'instalando' || v.status === 'actualizando';
  const hasRun = v.installed && v.commands.runCmd;

  const buttons = [];
  if (busy) buttons.push(`<button class="btn sm" data-a="log">Ver progreso</button><button class="btn sm stop" data-a="stop">Cancelar</button>`);
  else if (running && v.liveKind === 'run') buttons.push(`<button class="btn sm go" data-a="live">Ver en vivo</button><button class="btn sm stop" data-a="stop">Detener</button>`);
  else if (!v.installed) buttons.push(`<button class="btn sm go" data-a="install">Instalar</button>`);
  else {
    if (hasRun && !running) buttons.push(`<button class="btn sm go" data-a="run">▶ Probar</button>`);
    if (v.updateAvailable && !running) buttons.push(`<button class="btn sm warn" data-a="update">↑ Actualizar</button>`);
  }
  if (v.status === 'fallo') buttons.push(`<button class="btn sm" data-a="log">Ver error</button>`);

  const tele = [
    v.language && ['LENG', v.language],
    v.stars && ['★'.repeat(starRank(v)), v.stars.toLocaleString('es'), `${v.stars.toLocaleString('es')} estrellas en GitHub. Las ★ del título comparan con tus repos instalados: 7 = el más popular, 1 = el menos.`],
    v.pushedAt && ['PUSH', ago(v.pushedAt)],
    v.license && v.license !== 'NOASSERTION' && ['LIC', v.license],
  ].filter(Boolean);

  return `
  <article class="cell" data-id="${esc(v.id)}" style="${teamStyle(tm)};--i:${Math.min(i, 12)}">
    <div class="card"><div class="card-in">
      <div class="card-head">
        <div class="avatar"><img src="https://github.com/${esc(owner)}.png?size=80" alt="" onerror="this.remove()">${esc(name[0].toUpperCase())}</div>
        <div class="title">
          <small>${esc(owner)}</small>
          <div class="name">
            <a href="https://github.com/${esc(v.fullName)}" target="_blank" rel="noopener" title="${esc(v.fullName)}">${esc(name)}</a>
            ${v.tags.length ? `<span class="hash" tabindex="0" data-tip="${esc(v.tags.map((t) => `#${t}`).join('  '))}">#</span>` : ''}
          </div>
        </div>
        <div class="head-side">
          ${v.localPath ? `<button class="icon-btn edit-btn track-btn" data-a="copy-path" data-tip="Copiar ruta local de este repo" aria-label="Copiar ruta local de este repo">${trackIcon(v.id)}</button>` : ''}
          ${v.installed && !busy ? `<button class="icon-btn edit-btn" data-a="log" data-tip="Telemetría: el registro de lo que hizo la instalación o la última ejecución" aria-label="Telemetría">${METRICS}</button>` : ''}
          <button class="icon-btn edit-btn" data-a="edit" data-tip="Editar: categoría, tags, notas, comandos, desinstalar o eliminar" aria-label="Editar">${WRENCH}</button>
          <span class="pos">P${i + 1}</span>
        </div>
      </div>
      ${tele.length ? `<div class="tele">${tele.map(([l, x, tip]) => `<div${tip ? ` data-tip="${esc(tip)}"` : ''}><small${l[0] === '★' ? ' class="stars"' : ''}>${l}</small><b>${esc(x)}</b></div>`).join('')}</div>` : ''}
      <p class="desc">${esc(v.description) || '<i>Sin descripción</i>'}</p>
      ${v.notes ? `<p class="radio">${esc(v.notes)}</p>` : ''}
      <div class="pills">
        ${badge(STATUS_BADGE[v.status])}
        ${VERDICT_BADGE[v.verdict] ? badge(VERDICT_BADGE[v.verdict]) : ''}
        ${v.category ? `<span class="badge cat">${esc(v.category)}</span>` : ''}
        ${v.archived ? badge(['var(--warn)', led, 'Archivado']) : ''}
        <button class="badge more" data-a="more" hidden></button>
      </div>
      ${v.metaError ? `<div class="meta-err">⚠ ${esc(v.metaError)}</div>` : ''}
      ${buttons.length ? `<div class="actions">${buttons.join('')}</div>` : ''}
      ${demoBand(v)}
    </div></div>
  </article>`;
}

function render() {
  renderTower();
  renderCats();
  const list = visible();
  $('#grid').innerHTML = list.map(card).join('');
  $('#empty').hidden = list.length > 0;
  hideTip();
  fitPills();
  $('#emptyText').textContent = state.repos.length
    ? 'Nada coincide con tu búsqueda.'
    : 'Pega arriba la URL de un repo de GitHub para salir a pista.';
  $('#catList').innerHTML = [...new Set(state.repos.map((v) => v.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('');
  if (state.drawerId) renderDrawer();
}

// Los badges de una card caben en una sola línea; lo que sobra se oculta tras un "+N" que los abre.
function fitPills() {
  document.querySelectorAll('.pills').forEach((p) => {
    const more = p.querySelector('.more');
    const items = [...p.children].filter((c) => c !== more);
    p.classList.remove('open');
    items.forEach((c) => (c.hidden = false));
    more.hidden = true;
    if (p.scrollWidth <= p.clientWidth) return;
    more.hidden = false;
    let hidden = 0;
    more.textContent = '+0';
    while (p.scrollWidth > p.clientWidth && hidden < items.length - 1) {
      items[items.length - 1 - hidden++].hidden = true;
      more.textContent = `+${hidden}`;
    }
    if (state.open.has(p.closest('.cell').dataset.id)) {
      items.forEach((c) => (c.hidden = false));
      p.classList.add('open');
      more.textContent = '−';
      more.dataset.tip = 'Mostrar menos';
    } else more.dataset.tip = 'Mostrar todas';
  });
}

// Tooltip global: cualquier elemento con data-tip lo muestra al pasar el mouse (no lo recortan las cards).
const tip = document.createElement('div');
tip.id = 'tip';
tip.hidden = true;
document.body.append(tip);

function hideTip() {
  tip.hidden = true;
}

function showTip(el) {
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
  const below = r.bottom + 10 + tip.offsetHeight < innerHeight;
  tip.style.left = `${left}px`;
  tip.style.top = `${below ? r.bottom + 10 : r.top - 10 - tip.offsetHeight}px`;
}

document.addEventListener('mouseover', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (el) showTip(el);
  else hideTip();
});
document.addEventListener('focusin', (e) => e.target.closest?.('[data-tip]') && showTip(e.target.closest('[data-tip]')));
document.addEventListener('focusout', hideTip);
document.addEventListener('mouseout', (e) => e.relatedTarget || hideTip());
document.addEventListener('scroll', hideTip, true);

window.addEventListener('resize', fitPills);
document.fonts?.ready.then(fitPills);

// ---------- pit wall: en vivo / telemetría ----------

const drawerRepo = () => state.repos.find((v) => v.id === state.drawerId);

function openDrawer(id, tab) {
  state.drawerId = id;
  state.tab = tab;
  $('#drawer').hidden = false;
  renderDrawer(true);
}

async function renderDrawer(force) {
  const v = drawerRepo();
  if (!v) return void ($('#drawer').hidden = true);
  $('#dTitle').textContent = v.fullName;
  $('#dKind').textContent = v.liveKind === 'demo' ? 'MI DEMO · EN VIVO' : v.liveKind === 'run' ? 'REPO · EN VIVO' : 'PIT WALL';
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === state.tab));

  $('#dActions').innerHTML = `
    ${v.liveKind ? `<button class="btn sm stop" data-a="stop">Detener</button>` : ''}
    ${v.liveUrl ? `<a class="btn sm ghost" href="${esc(v.liveUrl)}" target="_blank" rel="noopener">Abrir en pestaña ↗</a>` : ''}
    <span class="spacer"></span>
    <button class="btn sm ${v.verdict === 'funciona' ? 'demo' : 'ghost'}" data-a="verdict:funciona">✓ Funciona</button>
    <button class="btn sm ${v.verdict === 'no-funciona' ? 'stop' : 'ghost'}" data-a="verdict:no-funciona">✗ No funciona</button>`;

  const body = $('#dBody');
  if (state.tab === 'demo') {
    if (v.liveUrl) {
      if (body.dataset.src !== v.liveUrl) {
        body.innerHTML = `<div class="screen"><span class="rec">ONBOARD · EN VIVO</span><iframe src="${esc(v.liveUrl)}" title="En vivo"></iframe></div>`;
        body.dataset.src = v.liveUrl;
      }
    } else {
      body.dataset.src = '';
      body.innerHTML = `<div class="screen"><div class="placeholder"><strong>${v.liveKind ? 'ESPERANDO SEÑAL' : 'SIN SEÑAL'}</strong>${
        v.liveKind ? 'El servidor todavía no anuncia su dirección… revisa la telemetría.' : 'Nada corriendo. Usa “Probar” o “Ver demo” en la card.'
      }</div></div>`;
    }
    return;
  }
  body.dataset.src = '';
  const { log } = await api(`/repos/${v.id}/log?tail=400`);
  let pre = body.querySelector('pre');
  if (!pre) {
    body.innerHTML = `<div class="screen"><pre></pre></div>`;
    pre = body.querySelector('pre');
  }
  const atBottom = force || pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
  pre.textContent = log || '(sin telemetría todavía)';
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

// ---------- eventos ----------

$('#add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#addUrl');
  const urls = input.value.trim();
  if (!urls) return;
  $('#addBtn').disabled = true;
  try {
    const r = await api('/repos', { method: 'POST', body: { urls } });
    input.value = '';
    const notes = [];
    if (r.existing.length) notes.push(`Ya estaban: ${r.existing.map((x) => x.fullName).join(', ')}`);
    r.errors.filter((x) => !r.self?.includes(x.ref)).forEach((x) => notes.push(`${x.ref}: ${x.error}`));
    flash(notes.join('\n'));
    state.snapshot = '';
    await refresh();
    if (r.self?.length) {
      await ask({ kind: 'GARAGE DENTRO DE GARAGE', title: 'En serio amig@? Pa qué?', text: 'Meterías un garage dentro de un garage?', yes: 'Ya, me rindo', no: null });
    } else if (r.added.length === 1) openEdit(r.added[0].id); // para categorizarlo al tiro
  } catch (err) {
    flash(err.message);
  } finally {
    $('#addBtn').disabled = false;
  }
});

$('#theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
});

$('#msgClose').addEventListener('click', () => flash(''));

$('#q').addEventListener('input', (e) => ((state.q = e.target.value), render()));
$('#status').addEventListener('change', (e) => ((state.status = e.target.value), render()));
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (b) ((state.cat = b.dataset.cat), render());
});

$('#checkAll').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  b.textContent = 'Consultando…';
  await act('/check', { method: 'POST' });
  b.disabled = false;
  b.textContent = '⟳ Buscar actualizaciones';
});

const actions = {
  install: (v) => act(`/repos/${v.id}/install`, { method: 'POST' }),
  update: (v) => act(`/repos/${v.id}/update`, { method: 'POST' }),
  run: async (v) => {
    await act(`/repos/${v.id}/run`, { method: 'POST' });
    openDrawer(v.id, 'demo');
  },
  demo: async (v) => {
    await act(`/repos/${v.id}/demo`, { method: 'POST' });
    openDrawer(v.id, 'demo');
  },
  // Crea la plantilla y la abre: trae el prompt para que Claude arme la demo de verdad.
  'create-demo': async (v) => {
    try {
      await api(`/repos/${v.id}/create-demo`, { method: 'POST' });
      state.snapshot = '';
      await refresh();
      await actions.demo(v);
    } catch (e) {
      flash(e.message);
    }
  },
  'folder-demo': (v) => act(`/repos/${v.id}/reveal`, { method: 'POST', body: { what: 'demo' } }),
  // Copia la ruta del clon: sirve para abrirlo como proyecto en Claude, pasárselo a otra IA o a un editor.
  'copy-path': async (v, btn) => {
    const original = btn.dataset.tip;
    try {
      await copyText(v.localPath);
      btn.dataset.tip = '¡Ruta copiada!';
    } catch (e) {
      btn.dataset.tip = 'No se pudo copiar';
      flash(e.message);
    }
    showTip(btn);
    setTimeout(() => {
      if (btn.isConnected) btn.dataset.tip = original;
    }, 1600);
  },
  stop: (v) => act(`/repos/${v.id}/stop`, { method: 'POST' }),
  live: (v) => openDrawer(v.id, 'demo'),
  log: (v) => openDrawer(v.id, 'log'),
  edit: (v) => openEdit(v.id),
  more: (v) => {
    state.open.has(v.id) ? state.open.delete(v.id) : state.open.add(v.id);
    fitPills();
  },
};

$('#grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  const v = b && state.repos.find((r) => r.id === b.closest('.cell').dataset.id);
  if (v) actions[b.dataset.a](v, b);
});

$('#dActions').addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a;
  const v = drawerRepo();
  if (!a || !v) return;
  if (a === 'stop') actions.stop(v);
  if (a.startsWith('verdict:')) act(`/repos/${v.id}`, { method: 'PATCH', body: { verdict: a.slice(8) } });
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => ((state.tab = t.dataset.tab), renderDrawer(true))));
$('#dClose').addEventListener('click', () => {
  state.drawerId = null;
  $('#dBody').innerHTML = '';
  $('#dBody').dataset.src = '';
  $('#drawer').hidden = true;
});

// ---------- edición ----------

let editing = null;

function openEdit(id) {
  const v = state.repos.find((r) => r.id === id);
  if (!v) return;
  editing = v;
  const f = $('#editForm');
  $('#eTitle').textContent = v.fullName;
  f.category.value = v.category;
  f.tags.value = v.tags.join(', ');
  f.notes.value = v.notes;
  f.verdict.value = v.verdict;
  f.installCmd.value = v.installCmd;
  f.runCmd.value = v.runCmd;
  f.installCmd.placeholder = v.commands.installCmd || '(automático) · “-” = no reinstalar nunca';
  f.runCmd.placeholder = v.commands.runCmd || (v.installed ? 'No detecté cómo ejecutarlo: escríbelo aquí' : '(se detecta al instalar)');
  $('#eHint').textContent = 'Instalar y probar ejecutan código del repo en tu equipo: revisa lo que instalas.';
  $('#uninstallBox').hidden = !(v.installed && v.managed);
  $('#edit').showModal();
}

$('#editForm').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'save') return;
  const f = e.target;
  await act(`/repos/${editing.id}`, {
    method: 'PATCH',
    body: { category: f.category.value, tags: f.tags.value, notes: f.notes.value, verdict: f.verdict.value, installCmd: f.installCmd.value, runCmd: f.runCmd.value },
  });
});

$('#eUninstall').addEventListener('click', async () => {
  const v = editing;
  const ok = await ask({
    kind: 'DESINSTALAR',
    title: v.fullName,
    text: 'Se borra la carpeta instalada. El repo sigue en tu catálogo, con tu demo y tus notas.',
    lines: [['Carpeta: ', v.localPath]],
    yes: 'Desinstalar',
    danger: true,
  });
  if (!ok) return;
  $('#edit').close();
  await act(`/repos/${v.id}/uninstall`, { method: 'POST' });
});

$('#eDelete').addEventListener('click', async () => {
  const v = editing;
  const files = v.installed && v.managed;
  const lines = ['Sale de tu catálogo (categoría, tags, notas, veredicto).'];
  if (files) lines.push(['Se borran los archivos instalados: ', v.localPath]);
  else if (v.installed) lines.push(['No se toca el clon, porque no lo instaló Repoteca: ', v.localPath]);
  if (v.hasDemo) lines.push(['Se borra tu demo: ', v.demoPath]);
  lines.push('Se borran sus registros.');
  const ok = await ask({ kind: 'ELIMINAR POR COMPLETO', title: v.fullName, text: 'No se puede deshacer.', lines, yes: 'Eliminar', danger: true });
  if (!ok) return;
  $('#edit').close();
  await act(`/repos/${v.id}?files=${files ? 1 : 0}&demo=${v.hasDemo ? 1 : 0}`, { method: 'DELETE' });
});

// ---------- arranque ----------

refresh();
setInterval(() => {
  if (document.hidden) return;
  refresh();
  if (state.drawerId && state.tab === 'log') renderDrawer();
}, 2000);
