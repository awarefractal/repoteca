import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

process.env.REPOTECA_DATA = tempData();
delete process.env.GITHUB_TOKEN;
const core = await import('../src/core.mjs');

// GitHub simulado: nada de red. Cada repo trae los mismos campos que la API real.
const fake = (n) => ({
  full_name: `org${n}/proyecto-${n}`,
  description: `Repo ${n}`,
  language: 'JavaScript',
  stargazers_count: n,
  topics: ['demo'],
  license: { spdx_id: 'MIT' },
  default_branch: 'main',
  pushed_at: '2026-01-01T00:00:00Z',
  archived: false,
  homepage: '',
});
const STARS = [...Array.from({ length: 149 }, (_, i) => fake(i + 1)), { ...fake(0), full_name: 'awarefractal/repoteca' }];

const requested = [];
globalThis.fetch = async (url) => {
  const u = new URL(url);
  requested.push(u.pathname + u.search);
  if (u.pathname === '/users/nadie/starred') return new Response('{}', { status: 404 });
  const page = +u.searchParams.get('page');
  return Response.json(STARS.slice((page - 1) * 100, page * 100));
};

test('importa los Stars de un usuario: sin instalar, paginando de a 100 y omitiendo a Repoteca', async () => {
  const r = await core.importStars({ user: '@alguien', category: 'Stars' });
  assert.equal(r.fetched, 150);
  assert.equal(r.added.length, 149);
  assert.equal(r.self, 1);
  assert.deepEqual(requested, ['/users/alguien/starred?per_page=100&page=1', '/users/alguien/starred?per_page=100&page=2']);

  const repos = core.listRepos();
  assert.equal(repos.length, 149);
  assert.ok(repos.every((v) => !v.installed && v.status === 'sin-instalar' && v.category === 'Stars' && v.tags.includes('star')));
  assert.equal(repos[0].fullName, 'org1/proyecto-1', 'la estrella más reciente queda arriba');
  assert.equal(repos[0].license, 'MIT');
});

test('importar otra vez no duplica nada', async () => {
  const r = await core.importStars({ user: 'alguien' });
  assert.equal(r.added.length, 0);
  assert.equal(r.existing, 149);
  assert.equal(core.listRepos().length, 149);
});

test('respeta el límite pedido', async () => {
  const r = await core.importStars({ user: 'otro', limit: 5 });
  assert.equal(r.fetched, 5);
  assert.equal(r.existing, 5); // ya estaban todos de la corrida anterior
});

test('errores claros: sin usuario ni token, usuario inválido y usuario inexistente', async () => {
  await assert.rejects(core.importStars({}), /Indica tu usuario/);
  await assert.rejects(core.importStars({ user: '../orgs/x' }), /No parece un usuario/);
  await assert.rejects(core.importStars({ user: 'nadie' }), /No existe el usuario/);
});
