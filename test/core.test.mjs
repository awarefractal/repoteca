import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData } from './helpers.mjs';

// core.mjs lee REPOTECA_DATA al cargarse: se define antes del import.
process.env.REPOTECA_DATA = tempData();
const core = await import('../src/core.mjs');

test('parseRepoRef entiende las formas habituales de nombrar un repo', () => {
  const ok = { owner: 'octocat', name: 'Hello-World' };
  for (const input of [
    'https://github.com/octocat/Hello-World',
    'https://github.com/octocat/Hello-World/',
    'https://github.com/octocat/Hello-World.git',
    'https://github.com/octocat/Hello-World/tree/main/src',
    'https://github.com/octocat/Hello-World?tab=readme-ov-file#readme',
    'git@github.com:octocat/Hello-World.git',
    'github.com/octocat/Hello-World',
    'octocat/Hello-World',
    '  octocat/Hello-World  ',
  ]) {
    assert.deepEqual(core.parseRepoRef(input), ok, input);
  }
});

test('parseRepoRef conserva puntos y guiones del nombre', () => {
  assert.deepEqual(core.parseRepoRef('https://github.com/vercel/next.js'), { owner: 'vercel', name: 'next.js' });
  assert.deepEqual(core.parseRepoRef('https://github.com/a-b/c_d.e.git'), { owner: 'a-b', name: 'c_d.e' });
});

test('parseRepoRef rechaza lo que no es un repo de GitHub', () => {
  for (const input of ['', 'hola', 'https://example.com/octocat/Hello-World', 'https://github.com/octocat', 'a/b/c']) {
    assert.equal(core.parseRepoRef(input), null, input);
  }
});

test('resolveId normaliza a minúsculas y falla con entradas inválidas', () => {
  assert.equal(core.resolveId('https://github.com/OctoCat/Hello-World.git'), 'octocat/hello-world');
  assert.throws(() => core.resolveId('no es un repo'), /No es una URL/);
});

test('Repoteca no se agrega a sí misma, ni con otra forma de escribirla', async () => {
  for (const input of [
    'https://github.com/awarefractal/repoteca',
    'https://github.com/AwareFractal/Repoteca.git',
    'awarefractal/repoteca',
    'https://github.com/alguien/repoteca', // un fork cualquiera llamado repoteca
  ]) {
    await assert.rejects(core.addRepo(input), (e) => e.self === true, input);
  }
});

test('addMany reporta a Repoteca en "self" sin tocar el catálogo', async () => {
  const r = await core.addMany('https://github.com/awarefractal/repoteca');
  assert.deepEqual(r.self, ['https://github.com/awarefractal/repoteca']);
  assert.equal(r.added.length, 0);
  assert.deepEqual(core.listRepos(), []);
});

test('addMany falla si el texto no trae ninguna URL de GitHub', async () => {
  await assert.rejects(core.addMany('nada que ver'), /No encontré ninguna URL/);
});
