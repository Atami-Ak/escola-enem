// Testes de js/dados.js (repositório + validadores). Uso: node tools/dados_test.js
const assert = require('assert');

const mem = new Map();
global.localStorage = {
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};
const { repo, VALIDA } = require('../js/dados.js');
const cru = (k, t) => mem.set('enem:' + k, t);

// storage ausente / inexistente
assert.strictEqual(repo.get('escola:aluno'), null);
assert.deepStrictEqual(repo.get('escola:agenda', undefined, []), []);

// JSON quebrado, null, número, array onde é objeto
for (const t of ['{x', 'null', '42', '[1,2]', '"s"']) {
  cru('escola:aluno', t); assert.strictEqual(repo.get('escola:aluno'), null, t);
  cru('escola:livros', t); assert.strictEqual(repo.get('escola:livros'), null, t);
  cru('escola:teste', t); assert.strictEqual(repo.get('escola:teste'), null, t);
}
cru('escola:agenda', '{"a":1}'); assert.strictEqual(repo.get('escola:agenda'), null);

// 300 KB
cru('escola:aluno', JSON.stringify({ nome: 'x'.repeat(300 * 1024) }));
assert.strictEqual(repo.get('escola:aluno', undefined, 'fb'), 'fb');

// __proto__
cru('escola:livros', '{"__proto__":{"x":1},"a":"lido"}');
const lv = repo.get('escola:livros');
assert.deepStrictEqual(lv, { a: 'lido' });
assert.strictEqual(lv.x, undefined);
cru('x:jogo', '{"__proto__":{"x":1},"a":{"rod":[]}}');
assert.strictEqual(repo.get('x:jogo').x, undefined);
assert.deepStrictEqual(Object.keys(repo.get('x:jogo')), ['a']);

// agenda: 600 itens, título longo, data impossível, feito "sim", item sem id
const it = (i, o = {}) => ({ id: 'i' + i, titulo: 'T', tipo: 'prova', materia: 'mat', data: '2026-11-20', feito: false, ...o });
cru('escola:agenda', JSON.stringify(Array.from({ length: 600 }, (_, i) => it(i))));
assert.strictEqual(repo.get('escola:agenda').length, 500);
cru('escola:agenda', JSON.stringify([it(1, { titulo: 'a'.repeat(5000) }), it(2, { data: '2026-13-99' }), it(3, { feito: 'sim' }), { titulo: 'x', data: '2026-11-20' }, null, 7, it(4, { extra: 1 })]));
const ag = repo.get('escola:agenda');
assert.deepStrictEqual(ag.map((x) => x.id), ['i1', 'i3', 'i4']);
assert.strictEqual(ag[0].titulo.length, 60);
assert.strictEqual(ag[1].feito, false);
assert.strictEqual(ag[2].extra, undefined);

// aluno: visitas com lixo, duplicadas, nome longo, xpVisto inválido
cru('escola:aluno', JSON.stringify({ nome: '  ' + 'n'.repeat(40), visitas: ['lixo', '2026-11-01', '2026-11-01', 5, '2026-02-30'], xpVisto: -1, x: 1 }));
assert.deepStrictEqual(repo.get('escola:aluno'), { nome: 'n'.repeat(24), visitas: ['2026-11-01'] });
cru('escola:aluno', JSON.stringify({ nome: 'Ana', visitas: Array.from({ length: 500 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)), xpVisto: 30 }));
const al = repo.get('escola:aluno');
assert.strictEqual(al.visitas.length, 400); assert.strictEqual(al.xpVisto, 30);

// livros com HTML, valor inválido, limite
cru('escola:livros', JSON.stringify({ '<img onerror=1>': 'lido', b: '<img onerror=1>', c: 'quero' }));
assert.deepStrictEqual(repo.get('escola:livros'), { '<img onerror=1>': 'lido', c: 'quero' }); // chave é só dado; telas usam textContent
cru('escola:livros', JSON.stringify(Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['k' + i, 'lido']))));
assert.strictEqual(Object.keys(repo.get('escola:livros')).length, 300);

// caps e auto (leitura dos livros)
for (const t of ['{x', 'null', '42', '[1,2]', '"x"']) {
  cru('escola:caps', t); assert.strictEqual(repo.get('escola:caps'), null, t);
  cru('escola:auto', t); assert.strictEqual(repo.get('escola:auto'), null, t);
}
cru('escola:caps', JSON.stringify({ a: [1, '1', 2], b: [1, 0], c: [1, 0, 1, 0, 1], d: 'x', e: null, f: [0, 1, 1] }));
assert.deepStrictEqual(repo.get('escola:caps'), { a: [1, 0, 0], f: [0, 1, 1] });
cru('escola:caps', '{"__proto__":[1,1,1],"a":[1,1,1]}');
const cp = repo.get('escola:caps');
assert.deepStrictEqual(cp, { a: [1, 1, 1] }); assert.strictEqual(cp.x, undefined); assert.strictEqual(Object.getPrototypeOf(cp), Object.prototype);
cru('escola:caps', JSON.stringify(Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['k' + i, [1, 0, 0]]))));
assert.strictEqual(Object.keys(repo.get('escola:caps')).length, 300);
cru('escola:auto', JSON.stringify({ a: 'true', b: 1, c: true, d: false, constructor: true }));
assert.deepStrictEqual(repo.get('escola:auto'), { c: true });
assert.strictEqual(repo.set('escola:caps', { l1: [1, 0, 1] }), true);
assert.deepStrictEqual(repo.get('escola:caps'), { l1: [1, 0, 1] });
assert.strictEqual(repo.set('escola:auto', { l1: true }), true);
assert.deepStrictEqual(repo.get('escola:auto'), { l1: true });

// plano
cru('escola:plano', JSON.stringify({ mat: [1, 9, '2', 3.5, 0, -1, 6] }));
assert.deepStrictEqual(repo.get('escola:plano'), { mat: [1, 0, 6] });

// teste: nota 9 e "3"
cru('escola:teste', JSON.stringify({ antes: { nota: 9, data: '2026-11-01' }, depois: { nota: '3', data: '2026-11-01' } }));
assert.deepStrictEqual(repo.get('escola:teste'), {});
cru('escola:teste', JSON.stringify({ antes: { nota: 3, data: '2026-11-01', z: 1 } }));
assert.deepStrictEqual(repo.get('escola:teste'), { antes: { nota: 3, data: '2026-11-01' } });

// ultimo: slug 'a b'
cru('escola:ultimo', JSON.stringify({ slug: 'a b', id: 'x' })); assert.strictEqual(repo.get('escola:ultimo'), null);
cru('escola:ultimo', JSON.stringify({ slug: 'mat', id: 'x'.repeat(200) })); assert.strictEqual(repo.get('escola:ultimo').id.length, 80);

// jogo/licoes: >2000 entradas e tipo errado
cru('mat:licoes', JSON.stringify(Object.fromEntries(Array.from({ length: 2001 }, (_, i) => ['k' + i, {}]))));
assert.strictEqual(repo.get('mat:licoes'), null);
cru('mat:jogo', '[1]'); assert.strictEqual(repo.get('mat:jogo'), null);

// ida e volta
mem.clear();
assert.strictEqual(repo.set('escola:aluno', { nome: 'Bia', visitas: ['2026-11-02'] }), true);
assert.deepStrictEqual(repo.get('escola:aluno'), { nome: 'Bia', visitas: ['2026-11-02'] });
assert.strictEqual(repo.set('escola:agenda', [it(1)]), true);
assert.deepStrictEqual(repo.get('escola:agenda'), [it(1)]);
assert.strictEqual(repo.get('qualquer:coisa'), null);
repo.set('qualquer:coisa', { a: 1 }); assert.deepStrictEqual(repo.get('qualquer:coisa'), { a: 1 });
const circ = {}; circ.c = circ; assert.strictEqual(repo.set('escola:x', circ), false);

// list / remove / clear
repo.set('mat:jogo', { a: 1 }); mem.set('outra', 'x'); mem.set('enem_x', 'y');
assert.deepStrictEqual(repo.list('escola:').sort(), ['escola:agenda', 'escola:aluno']);
repo.remove('escola:aluno'); assert.strictEqual(repo.get('escola:aluno'), null);
assert.strictEqual(repo.clear('escola:'), true);
assert.deepStrictEqual(repo.list('escola:'), []);
assert.ok(mem.has('enem:mat:jogo') && mem.has('outra') && mem.has('enem_x'));

// estudo / duracao / aviso
repo.set('escola:estudo', JSON.parse('{"2026-02-30":5,"x":1,"2026-11-16":-1,"2026-11-17":1441,"2026-11-18":2.5,"__proto__":3,"2026-11-19":30}'));
assert.deepStrictEqual(repo.get('escola:estudo'), { '2026-11-19': 30 });
const muitos = {}; for (let i = 0; i < 500; i++) muitos[new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)] = 1;
const e4 = VALIDA['escola:estudo'](muitos);
assert.strictEqual(Object.keys(e4).length, 400); assert.ok(!('2020-01-01' in e4) && '2021-05-14' in e4);
for (const x of [[], null, 'a', 5]) assert.strictEqual(VALIDA['escola:estudo'](x), null);
mem.set('enem:escola:estudo', '{x'); assert.strictEqual(repo.get('escola:estudo'), null);
repo.set('escola:duracao', JSON.parse('{"mat":45,"red":"45","fis":50,"__proto__":25}'));
assert.deepStrictEqual(repo.get('escola:duracao'), { mat: 45 });
assert.strictEqual(VALIDA['escola:duracao']([1]), null);
repo.set('escola:aviso', '2026-11-16'); assert.strictEqual(repo.get('escola:aviso'), '2026-11-16');
for (const x of ['ontem', 5, {}, null]) assert.strictEqual(VALIDA['escola:aviso'](x), null);
mem.set('enem:escola:aviso', '{x'); assert.strictEqual(repo.get('escola:aviso'), null);
repo.remove('escola:estudo'); repo.remove('escola:duracao'); repo.remove('escola:aviso');

// storage que lança em tudo
const real = global.localStorage;
const boom = () => { throw new Error('bloqueado'); };
global.localStorage = { get length() { boom(); }, key: boom, getItem: boom, setItem: boom, removeItem: boom };
assert.strictEqual(repo.get('escola:aluno'), null);
assert.deepStrictEqual(repo.get('escola:agenda', undefined, []), []);
assert.strictEqual(repo.set('escola:aluno', {}), false);
assert.strictEqual(repo.remove('x'), false);
assert.deepStrictEqual(repo.list('escola:'), []);
assert.strictEqual(repo.clear('escola:'), true);
global.localStorage = real;
assert.ok(typeof VALIDA['escola:aluno'] === 'function');

console.log('OK dados_test');
