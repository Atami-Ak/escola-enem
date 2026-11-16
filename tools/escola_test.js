// Testes das funções puras do planejador em js/escola.js. Uso: node tools/escola_test.js
const assert = require('assert');
const { DATA_ENEM, diasAte, textoContagem, diaSemana, normPlano, materiasDoDia, linkYoutube, COM_TEXTO, marcaCap, fasesDe, listaFases, estadoEm, xpEstudo, deveAvisar, semanaDe, resumoSemana } = require('../js/escola.js');

assert.strictEqual(DATA_ENEM, '2027-11-07');
assert.strictEqual(diasAte('2027-11-07', '2027-11-07'), 0);
assert.strictEqual(diasAte('2027-11-07', '2027-11-06'), 1);
assert.strictEqual(diasAte('2027-11-07', '2027-11-08'), -1);
assert.strictEqual(diasAte('2027-11-07', '2026-11-17'), 355);

assert.strictEqual(textoContagem(355), 'Faltam 355 dias para o ENEM 2027');
assert.strictEqual(textoContagem(1), 'Falta 1 dia para o ENEM 2027');
assert.strictEqual(textoContagem(0), 'O ENEM é hoje');
assert.ok(textoContagem(-1).startsWith('A data prevista já passou'));

assert.strictEqual(diaSemana('2026-11-15'), 0);
assert.strictEqual(diaSemana('2026-11-16'), 1);
assert.strictEqual(diaSemana('2026-11-21'), 6);

const pl = { mat: [1, 0], redacao: [3] };
assert.deepStrictEqual(materiasDoDia(pl, 0), ['mat']);
assert.deepStrictEqual(materiasDoDia(pl, 3), ['redacao']);
assert.deepStrictEqual(materiasDoDia(pl, 5), []);

assert.deepStrictEqual(normPlano({ x: [9], mat: [1, 1, '2', 7, 0, 1.5, 3], redacao: 'a' }, ['mat', 'redacao']), { mat: [1, 3, 0] });
assert.deepStrictEqual(normPlano(null, ['mat']), {});
assert.deepStrictEqual(normPlano([1], ['mat']), {});

const u = linkYoutube('Redação', 'Conectivos e coesão');
assert.ok(u.startsWith('https://www.youtube.com/results?search_query='));
assert.ok(!/ /.test(u) && u.includes('%C3%A7') && u.endsWith('ENEM%20aula'));
const q = linkYoutube('Física', 'A&B?');
assert.ok(q.includes('A%26B%3F'));
assert.ok(linkYoutube('Física').endsWith('search_query=F%C3%ADsica%20ENEM%20aula'));

// leitura dos livros: marcaCap (função pura)
assert.deepStrictEqual(COM_TEXTO, ['l1', 'l2', 'l3', 'l4']);
const vz = { livros: {}, caps: {}, auto: {} };
const cong = JSON.stringify(vz);
let s1 = marcaCap(vz, 'l1', 0);
assert.deepStrictEqual(s1.caps.l1, [1, 0, 0]); assert.strictEqual(s1.ev, null);
assert.strictEqual(JSON.stringify(vz), cong); // entrada não é mutada
s1 = marcaCap(s1, 'l1', 1);
s1 = marcaCap(s1, 'l1', 2);
assert.strictEqual(s1.ev, 'concluido'); assert.strictEqual(s1.livros.l1, 'lido'); assert.strictEqual(s1.auto.l1, true);
const s2 = marcaCap(s1, 'l1', 1);
assert.strictEqual(s2.ev, 'voltou'); assert.strictEqual(s2.livros.l1, 'quero'); assert.ok(!('l1' in s2.auto));
assert.deepStrictEqual(s2.caps.l1, [1, 0, 1]);
// lido manual (sem auto): 3/3 e desmarcar não mudam o status
const man = { livros: { l2: 'lido' }, caps: { l2: [1, 1, 0] }, auto: {} };
const m1 = marcaCap(man, 'l2', 2);
assert.strictEqual(m1.ev, null); assert.strictEqual(m1.livros.l2, 'lido'); assert.ok(!('l2' in m1.auto));
const m2 = marcaCap(m1, 'l2', 0);
assert.strictEqual(m2.ev, null); assert.strictEqual(m2.livros.l2, 'lido');
assert.deepStrictEqual(man, { livros: { l2: 'lido' }, caps: { l2: [1, 1, 0] }, auto: {} });
// outro livro não é tocado
assert.deepStrictEqual(marcaCap({ livros: {}, caps: { l3: [1, 0, 0] }, auto: {} }, 'l1', 0).caps.l3, [1, 0, 0]);

// sessão de estudo
assert.deepStrictEqual(fasesDe('p25', 45), { foco: 25, pausa: 5, ciclos: 2 });
assert.strictEqual(fasesDe('p25', 25).ciclos, 1);
assert.strictEqual(fasesDe('p50', 45).ciclos, 1);
assert.deepStrictEqual(fasesDe('bloco', 90), { foco: 90, pausa: 0, ciclos: 1 });
const MIN = 60000, t0 = 1e12;
const ses = { fases: listaFases(fasesDe('p25', 50)), acumMs: 0, desde: t0 }; // foco, pausa, foco
assert.strictEqual(ses.fases.length, 3);
let e = estadoEm(ses, t0); assert.strictEqual(e.tipo, 'foco'); assert.strictEqual(e.restanteMs, 25 * MIN); assert.strictEqual(e.fim, false);
e = estadoEm(ses, t0 + 24 * MIN + 59000); assert.strictEqual(e.tipo, 'foco'); assert.strictEqual(e.restanteMs, 1000);
e = estadoEm(ses, t0 + 25 * MIN); assert.strictEqual(e.tipo, 'pausa'); assert.strictEqual(e.ciclo, 1); assert.strictEqual(e.focoMs, 25 * MIN); assert.strictEqual(e.restanteMs, 5 * MIN);
e = estadoEm(ses, t0 + 31 * MIN); assert.strictEqual(e.tipo, 'foco'); assert.strictEqual(e.ciclo, 2); assert.strictEqual(e.ciclos, 2); assert.strictEqual(e.fase, 2); assert.strictEqual(e.focoMs, 26 * MIN); // pulou 2 fases
e = estadoEm({ ...ses, desde: null, acumMs: 10 * MIN }, t0 + 99 * MIN); assert.strictEqual(e.restanteMs, 15 * MIN); // pausado não anda
e = estadoEm(ses, t0 + 500 * MIN); assert.strictEqual(e.fim, true); assert.strictEqual(e.focoMs, 50 * MIN);
e = estadoEm(ses, t0 - 5 * MIN); assert.strictEqual(e.restanteMs, 25 * MIN); // relógio voltou: decorrido 0
assert.strictEqual(xpEstudo({ a: 300, b: 30 }), 70); assert.strictEqual(xpEstudo({}), 0); assert.strictEqual(xpEstudo({ a: 25 }), 8); assert.strictEqual(xpEstudo(null), 0);
const pq = { mat: [1] }; // 2026-11-16 é segunda
assert.strictEqual(deveAvisar(pq, {}, null, '2026-11-16'), true);
assert.strictEqual(deveAvisar({}, {}, null, '2026-11-16'), false);
assert.strictEqual(deveAvisar(pq, {}, null, '2026-11-17'), false); // dia livre
assert.strictEqual(deveAvisar(pq, { '2026-11-16': 1 }, null, '2026-11-16'), false);
assert.strictEqual(deveAvisar(pq, {}, '2026-11-16', '2026-11-16'), false);
assert.strictEqual(deveAvisar(pq, {}, '2026-11-15', '2026-11-16'), true);
assert.deepStrictEqual(semanaDe('2026-11-22'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
assert.strictEqual(semanaDe('2026-11-16')[0], '2026-11-16'); assert.strictEqual(semanaDe('2026-11-16')[6], '2026-11-22');
const rs = resumoSemana({ mat: [1, 3, 5], redacao: [2, 4, 6] }, { mat: 90 }, { '2026-11-16': 150, '2026-11-20': 150, '2026-11-23': 99 }, '2026-11-18');
assert.deepStrictEqual(rs, { feito: 300, planejado: 270 + 135 }); // 3x90 + 3x45; 23/11 fora da semana
assert.deepStrictEqual(resumoSemana({ mat: [1, 2] }, {}, {}, '2026-11-18'), { feito: 0, planejado: 90 });

console.log('escola_test OK');
