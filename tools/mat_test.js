// Testes das funções puras de js/mat.js. Uso: node tools/mat_test.js
const assert = require('assert');
const { folha, sorteio, parse, proxima, fila, diaPlano, sequencia, addDias, hoje, validarBackup,
  normE, calcula, rng, sortear, preencher, lerNumero, confere, responder, fecharRodada, revisar, proximoJogo } = require('../js/mat.js');
const fs = require('fs'), path = require('path');

const txt = (v) => ({ t: 'txt', v });

// parse
assert.deepStrictEqual(parse('{1/2}'), [{ t: 'frac', a: [txt('1')], b: [txt('2')] }]);
assert.deepStrictEqual(parse('x^{2}'), [txt('x'), { t: 'sup', c: [txt('2')] }]);
assert.deepStrictEqual(parse('x_{1}'), [txt('x'), { t: 'sub', c: [txt('1')] }]);
assert.deepStrictEqual(parse('sqrt{x}'), [{ t: 'sqrt', c: [txt('x')] }]);
assert.deepStrictEqual(parse('{{1/2}/3}'), [{ t: 'frac', a: [{ t: 'frac', a: [txt('1')], b: [txt('2')] }], b: [txt('3')] }]);
assert.deepStrictEqual(parse('sqrt{x^{2}+1} = {a/b}'), [
  { t: 'sqrt', c: [txt('x'), { t: 'sup', c: [txt('2')] }, txt('+1')] }, txt(' = '), { t: 'frac', a: [txt('a')], b: [txt('b')] }]);
assert.deepStrictEqual(parse('só texto, 3/4 km'), [txt('só texto, 3/4 km')]);
assert.deepStrictEqual(parse('m/s = km/h ÷ 3,6'), [txt('m/s = km/h ÷ 3,6')]);

// proxima: Leitner [0,1,2,4]
const H = '2026-03-10';
let c = proxima(null, 'acertei', H);
assert.strictEqual(c.cx, 2); assert.strictEqual(c.due, '2026-03-11'); assert.strictEqual(c.n, 1);
c = proxima(c, 'acertei', H); assert.strictEqual(c.cx, 3); assert.strictEqual(c.due, '2026-03-12');
c = proxima(c, 'acertei', H); assert.strictEqual(c.cx, 4); assert.strictEqual(c.due, '2026-03-14');
c = proxima(c, 'acertei', H); assert.strictEqual(c.cx, 4); assert.strictEqual(c.due, '2026-03-14'); // teto cx4
c = proxima(c, 'quase', H); assert.strictEqual(c.cx, 4); // Quase fica
c = proxima(c, 'errei', H); assert.strictEqual(c.cx, 1); assert.strictEqual(c.due, H); // intervalo 0: reentra hoje
assert.strictEqual(proxima({ cx: 3, n: 5, due: H }, 'quase', H).cx, 3);

// fila: sem vizinhos iguais quando possível
const itens = [...'AAABBC'].map((t, i) => ({ id: i, t }));
const f = fila(itens);
assert.strictEqual(f.length, itens.length);
for (let i = 1; i < f.length; i++) assert.notStrictEqual(f[i].t, f[i - 1].t);
assert.deepStrictEqual(fila([{ id: 1, t: 'A' }, { id: 2, t: 'A' }]).map((x) => x.id), [1, 2]); // só um tópico: mantém

// diaPlano
assert.strictEqual(diaPlano('2026-03-10', '2026-03-10'), 1);
assert.strictEqual(diaPlano('2026-03-10', '2026-03-12'), 3);
assert.strictEqual(diaPlano('2026-03-10', '2026-03-15'), 6);
assert.strictEqual(diaPlano('2026-03-10', '2026-04-20'), 6); // teto D6
assert.strictEqual(diaPlano('2026-01-30', '2026-02-02'), 4); // virada de mês local
assert.strictEqual(addDias('2026-02-28', 1), '2026-03-01');
assert.strictEqual(addDias('2024-02-28', 1), '2024-02-29');
assert.strictEqual(hoje(new Date(2026, 0, 5, 23, 59)), '2026-01-05'); // data local, não UTC

// sequencia
const d = { '2026-03-08': 10, '2026-03-09': 12, '2026-03-10': 10 };
assert.deepStrictEqual(sequencia(d, 10, '2026-03-10'), { atual: 3, melhor: 3 });
assert.strictEqual(sequencia(d, 10, '2026-03-11').atual, 3); // hoje ainda em aberto: não zera
assert.strictEqual(sequencia(d, 10, '2026-03-12').atual, 0); // dia inteiro sem meta zera
assert.strictEqual(sequencia(d, 10, '2026-03-12').melhor, 3);
assert.strictEqual(sequencia({ '2026-03-09': 4, '2026-03-10': 10 }, 10, '2026-03-10').atual, 1); // dia abaixo da meta quebra
assert.strictEqual(sequencia({}, 10, '2026-03-10').atual, 0);

// validarBackup
const ok = { app: 'enem-mat', versao: 1, dados: { meta: 10, inicio: '2026-03-01', caderno: [{ ref: 'a', causa: 'Conta', data: '2026-03-01' }], cards: { 'x:0': { cx: 2, due: '2026-03-02' } } } };
assert.strictEqual(validarBackup(ok), null);
assert.ok(validarBackup({ ...ok, app: 'x' }));
assert.ok(validarBackup({ ...ok, dados: { foo: 1 } }));
assert.ok(validarBackup({ ...ok, dados: { meta: 'dez' } }));
assert.ok(validarBackup(null));

// sorteio: n distintos, não muta a entrada, pool curto devolve tudo
const pool = Array.from({ length: 30 }, (_, i) => i);
let k = 0; const rnd = () => ((k = (k * 7 + 3) % 11) / 11);
const sr = sorteio(pool, 10, rnd);
assert.strictEqual(sr.length, 10); assert.strictEqual(new Set(sr).size, 10);
assert.ok(sr.every((x) => pool.includes(x)));
assert.strictEqual(pool.length, 30);
assert.strictEqual(sorteio([1, 2, 3], 10).length, 3);
assert.deepStrictEqual(sorteio([], 10), []);

// backup corrompido
const bk = (dados) => ({ app: 'enem-mat', versao: 1, dados });
assert.ok(validarBackup(bk({ cards: { a: { cx: 1.5, due: '2026-11-09' } } })));
assert.ok(validarBackup(bk({ cards: { a: { cx: 2, due: 'x' } } })));
assert.ok(validarBackup(bk({ licoes: { a: { ex: 'x' } } })));
assert.ok(validarBackup(bk({ caderno: [{ ref: 'r', causa: 'Conta' }] })));
assert.strictEqual(validarBackup(bk({ cards: { a: { cx: 2, due: '2026-11-09' } } })), null);

// folha: dedupe (quando x exemplo, entre tópicos), ordem, dia sem fórmulas, dia desconhecido
const DD = [
  { dia: 1, titulo: 'A', quando: { sinais: ['s1', 's2'], formula: 'x+1' }, exemplos: [{ formula: 'x+1' }, { formula: 'y' }, {}] },
  { dia: 1, titulo: 'B', exemplos: [{ formula: 'y' }, { formula: 'z' }] },
  { dia: 2, titulo: 'C', exemplos: [{ passos: [] }] },
];
assert.deepStrictEqual(folha(DD, 1), [
  { titulo: 'A', formula: 'x+1', uso: 's1' }, { titulo: 'A', formula: 'y', uso: 's1' }, { titulo: 'B', formula: 'z', uso: null }]);
// t.formulas tem prioridade sobre quando/exemplos; dedupe vale entre fontes
const DF = [
  { dia: 3, titulo: 'T', quando: { sinais: ['s'], formula: 'q' }, exemplos: [{ formula: 'e' }], formulas: [{ nome: 'N1', f: 'a', uso: 'u1' }, { nome: 'N2', f: 'b', uso: 'u2' }] },
  { dia: 3, titulo: 'U', exemplos: [{ formula: 'a' }, { formula: 'w' }] },
  { dia: 3, titulo: 'V', formulas: [{ nome: 'N3', f: 'b', uso: 'u3' }, { nome: 'N4', f: 'c', uso: 'u4' }] },
];
assert.deepStrictEqual(folha(DF, 3), [
  { titulo: 'N1', formula: 'a', uso: 'u1' }, { titulo: 'N2', formula: 'b', uso: 'u2' },
  { titulo: 'U', formula: 'w', uso: null }, { titulo: 'N4', formula: 'c', uso: 'u4' }]);
assert.deepStrictEqual(folha(DD, 2), []);
assert.deepStrictEqual(folha(DD, 9), []);
assert.deepStrictEqual(folha(null, 1), []);

// ---------- motor do jogo ----------
// calcula: [expr, valor]
const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
[['1+2*3', 7], ['(1+2)*3', 9], ['10-4-3', 3], ['100/5/2', 10], ['-2**2', -4], ['2**3**2', 512], ['2**-1', 0.5], ['(-2)**2', 4],
  ['--3', 3], ['+3', 3], ['2*-3', -6], ['1.5*2', 3], ['.5+.5', 1], ['1e3+1', 1001], ['pi', Math.PI], ['2*pi', 2 * Math.PI],
  ['sqrt(16)+1', 5], ['log(1)', 0], ['log10(1000)', 3], ['log(8, 2)', 3], ['comb(5,2)', 10], ['comb(2,5)', 0], ['comb(40,20)', 137846528820],
  ['factorial(5)', 120], ['factorial(0)', 1], ['180*22/15', 264], [' 3 + 4 ', 7],
].forEach(([e, v]) => assert.ok(near(calcula(e), v), `${e} deu ${calcula(e)}`));
assert.strictEqual(calcula('a*b+c', { a: 2, b: 3, c: 1 }), 7);
['1/0', '1/(2-2)', '0**-1', '2**101', '2**-101', '10**1000', 'sqrt(-1)', 'log(0)', 'foo(1)', 'eval(1)', 'sin(1)', 'sqrt()', 'sqrt(1,2)', 'comb(1)',
  'factorial(-1)', 'factorial(1.5)', 'factorial(171)', 'comb(171,2)', 'comb(5,-1)', 'a', 'x+1', '1 2', '1+', '(1', '1)', '1//2', '5%2', 'a.b', '__proto__', 'constructor',
  '', '2 ** ', '"a"', '1;2', 'sqrt', '[1]', 'e'].forEach((e) => assert.throws(() => calcula(e), `${e} deveria falhar`));
assert.throws(() => calcula('toString', {})); assert.throws(() => calcula('a', { a: NaN }));

// paridade JS/Python: todo exercicios[].conta de d1..d6 == valor
const dados = path.join(__dirname, '..', 'data', 'matematica');
let nContas = 0;
for (const f of fs.readdirSync(dados).filter((x) => /^d\d\.json$/.test(x))) {
  for (const t of JSON.parse(fs.readFileSync(path.join(dados, f), 'utf8'))) {
    for (const e of t.exercicios) {
      if (!('conta' in e)) continue;
      const k = (String(e.valor).split('.')[1] || '').length;
      assert.ok(Math.abs(calcula(e.conta) - e.valor) <= 0.5 * 10 ** -k + 1e-9, `${f}/${t.id}: ${e.conta} != ${e.valor}`);
      nContas++;
    }
  }
}
assert.ok(nContas >= 30, `poucas contas: ${nContas}`);

// rng: determinístico
const r42 = rng(42);
assert.deepStrictEqual([r42(), r42(), r42()], [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
const ra = rng(7), rb = rng(7), rc = rng(8);
const sa = [ra(), ra(), ra()];
assert.deepStrictEqual(sa, [rb(), rb(), rb()]);
assert.notDeepStrictEqual(sa, [rc(), rc(), rc()]);
assert.ok(sa.every((x) => x >= 0 && x < 1));

// sortear / preencher
const G = {
  vars: {}, deriv: { w: 'a*2' }, restricoes: [['positivo', 'a-1']],
  questoes: [{ vars: { a: { min: 2, max: 9 }, c: { min: 1, max: 2, step: 0.5, casas: 1 } }, enunciado: 'x', conta: 'w*c', unidade: 'u', casas: 1, passos: ['p', 'q'] },
    { vars: { a: { min: 1, max: 1 } }, conta: 'w', casas: 0 }, { vars: { a: { min: 2, max: 9 } }, conta: 'a/2', casas: 0 },
    { vars: { a: { min: 2, max: 9 } }, conta: '5-a', negativo: false, casas: 0 }],
};
const s1 = sortear(G, 0, 123), s2 = sortear(G, 0, 123);
assert.deepStrictEqual(s1, s2); // mesma seed, mesmos números
assert.ok(s1.vals.a >= 2 && s1.vals.a <= 9 && Number.isInteger(s1.vals.a));
assert.ok([1, 1.5, 2].includes(s1.vals.c));
assert.ok(near(s1.vals.valor, s1.vals.w * s1.vals.c) && s1.vals.w === s1.vals.a * 2);
assert.throws(() => sortear(G, 1, 1), /sem combinação/); // restrição impossível: erro após 50 tentativas
for (let sd = 0; sd < 40; sd++) {
  assert.strictEqual(sortear(G, 2, sd).vals.a % 2, 0); // casas 0 só aceita inteiro
  assert.ok(sortear(G, 3, sd).vals.valor >= 0); // negativo:false
}
const P = { vals: { a: 3, b: 2.5, v: 264, n: -4 }, casas: { a: 0, b: 2, v: 0, n: 0 } };
assert.strictEqual(preencher('{a} km e {b}', P), '3 km e 2,50');
assert.strictEqual(preencher('x^{a} y_{b} sqrt{a} {n}', P), 'x^{3} y_{2,50} sqrt{3} -4');
assert.strictEqual(preencher('{{v}/{a}} e {a/b} e {z}', P), '{264/3} e {a/b} e {z}'); // fração fica; indefinido fica
assert.deepStrictEqual(parse(preencher('x^{a}', P)), [txt('x'), { t: 'sup', c: [txt('3')] }]);

// lerNumero
[['1,5', 1.5], ['1.5', 1.5], ['1.500', 1.5], [' 12,50 km', 12.5, 'km'], ['R$ 1.234,50', 1234.5], ['R$ 1.234,5', 1234.5], ['1.234.567', 1234567],
  ['50%', 50], ['12 %', 12], ['-3,2', -3.2], ['−3', -3], ['  7  ', 7], ['12,5KM', 12.5, 'km'], ['0,5', 0.5], ['264', 264]].forEach(([s, v, u]) =>
  assert.strictEqual(lerNumero(s, u), v, `lerNumero(${JSON.stringify(s)})`));
['abc', '', '   ', '1,2,3', '1,234.5', '-', ',', '.', '1e3', 'NaN', '1 2', null, undefined].forEach((s) => assert.strictEqual(lerNumero(s), null, `lerNumero(${JSON.stringify(s)})`));
// texto junto do número: vale o último número solto (unidade escrita, conta, "x =")
[['12 reais', 12], ['168 páginas', 168, 'páginas'], ['168 pág.', 168], ['270 pagina', 270], ['10 × 27 = 270', 270], ['x = 168', 168], ['R$168,00', 168],
  ['168 cm3', 168, 'cm³'], ['resposta: 1.500 litros', 1.5], ['30 ÷ 3 = 10; 10 × 27 = 270.', 270]].forEach(([s, v, u]) =>
  assert.strictEqual(lerNumero(s, u), v, `lerNumero(${JSON.stringify(s)})`));

// confere: tolerância 0.5*10^-casas
assert.ok(confere(264, 264, 0)); assert.ok(confere(264.4, 264, 0)); assert.ok(confere(263.5, 264, 0)); assert.ok(confere(264.5, 264, 0));
assert.ok(!confere(264.6, 264, 0)); assert.ok(!confere(265, 264, 0));
assert.ok(confere(1.5, 1.52, 1)); assert.ok(confere(1.57, 1.52, 1)); assert.ok(!confere(1.58, 1.52, 1));
assert.ok(confere(2.35, 2.346, 2)); assert.ok(!confere(2.36, 2.346, 2));
assert.ok(!confere(null, 1, 0)); assert.ok(!confere(NaN, 1, 0));

// responder
let e = responder(null, true); assert.deepStrictEqual([e.n, e.seq], [1, 1]);
e = responder(e, true); assert.strictEqual(e.seq, 2);
e = responder(e, null); assert.deepStrictEqual([e.n, e.seq], [1, 0]); // Dica zera seq, não derruba
e = responder({ n: 3, seq: 4, rod: [], dp: '2026-03-01' }, false); assert.deepStrictEqual([e.n, e.seq, e.dp], [3, 0, '2026-03-01']); // erro avulso não muda nível

// fecharRodada: transições
const T = true, F = false;
const fr = (e0, oks, h = '2026-03-10') => fecharRodada(e0, oks, h);
let x = fr(null, [F, F, F, F, F]); assert.deepStrictEqual([x.n, x.seq], [1, 0]); // Tentada
x = fr(null, [T, T, F, F, F]); assert.strictEqual(x.n, 1);
x = fr(null, [T, T, T, F, F]); assert.deepStrictEqual([x.n, x.seq], [2, 0]); // 3/5 = Familiar
x = fr(null, [F, T, T, T, T]); assert.deepStrictEqual([x.n, x.seq], [2, 4]);
x = fr(null, [T, T, T, T, T]); assert.deepStrictEqual([x.n, x.seq], [2, 5]); // 5/5 sozinha não é Proficiente
assert.strictEqual(x.dp, null);
x = fr({ n: 2, seq: 3, rod: [], dp: null }, [T, T, F, F, F]); assert.deepStrictEqual([x.n, x.seq, x.dp], [3, 0, '2026-03-10']); // 3+2 cruzando
x = fr({ n: 2, seq: 1, rod: [], dp: null }, [T, T, T, T, F]); assert.strictEqual(x.n, 3); // 1+4
x = fr({ n: 2, seq: 0, rod: [], dp: null }, [T, T, T, T, T]); assert.strictEqual(x.n, 2); // seq0=0 não cruza
x = fr({ n: 2, seq: 3, rod: [], dp: null }, [F, T, T, T, T]); assert.strictEqual(x.n, 2); // quebra no início: não cruza
x = fr({ n: 2, seq: 2, rod: [], dp: null }, [T, T, F, F, F]); assert.strictEqual(x.n, 2); // 2+2 = 4
x = fr({ n: 1, seq: 4, rod: [], dp: null }, [T, F, F, F, F]); assert.strictEqual(x.n, 3); // 4+1 cruza mesmo vindo de Tentada
x = fr({ n: 3, seq: 0, rod: [], dp: '2026-03-10' }, [T, T, T, T, T], '2026-03-10'); assert.strictEqual(x.n, 3); // Dominada só em dia posterior
x = fr({ n: 3, seq: 0, rod: [], dp: '2026-03-10' }, [T, T, T, T, T], '2026-03-11'); assert.strictEqual(x.n, 4);
x = fr({ n: 3, seq: 0, rod: [], dp: '2026-03-10' }, [T, T, T, T, null], '2026-03-11'); assert.strictEqual(x.n, 4); // 4/5 com Dica no 5º: sem queda
x = fr({ n: 3, seq: 0, rod: [], dp: '2026-03-10' }, [T, T, T, F, F], '2026-03-11'); assert.strictEqual(x.n, 2); // 3/5 em revisão com erro: cai
assert.strictEqual(x.seq, 0); assert.deepStrictEqual(x.rod[x.rod.length - 1], { d: '2026-03-11', a: 3, q: 1 });
x = fr({ n: 4, seq: 7, rod: [], dp: '2026-03-01' }, [F, F, F, F, F]); assert.strictEqual(x.n, 3); // só 1 queda por rodada
x = fr({ n: 4, seq: 7, rod: [], dp: '2026-03-01' }, [T, T, T, T, F]); assert.strictEqual(x.n, 3); // erro em Dominada: desce
x = fr({ n: 3, seq: 2, rod: [], dp: '2026-03-10' }, [T, T, T, T, null]); assert.strictEqual(x.n, 3); // Dica: não acerto, sem queda
assert.strictEqual(x.seq, 0);
x = fr({ n: 2, seq: 0, rod: [], dp: null }, [F, F, F, F, F]); assert.strictEqual(x.n, 2); // erro abaixo de 3 não desce
x = fr({ n: 3, seq: 0, rod: [], dp: '2026-03-01' }, [T, T, T, T, T], '2026-03-02'); assert.deepStrictEqual([x.n, x.seq], [4, 5]);
// abandono: só mexe em seq (via responder), nível e rod intactos
const ab = responder(responder({ n: 2, seq: 3, rod: [], dp: null }, true), true);
assert.deepStrictEqual([ab.n, ab.seq, ab.rod.length], [2, 5, 0]);
// rod corta em 20
const pad2 = (n) => String(n).padStart(2, '0');
let ee = null; for (let k = 0; k < 25; k++) ee = fr(ee, [T, F, F, F, F], `2026-03-${pad2(k + 1)}`);
assert.strictEqual(ee.rod.length, 20); assert.strictEqual(ee.rod[19].d, '2026-03-25');
// fecharRodada não muta a entrada
const ent = { n: 2, seq: 3, rod: [], dp: null }; fr(ent, [T, T, T, T, T]); assert.deepStrictEqual(ent, { n: 2, seq: 3, rod: [], dp: null });

// revisar
assert.strictEqual(revisar(null, '2026-03-10'), false);
assert.strictEqual(revisar({ n: 3, seq: 0, rod: [], dp: '2026-03-10' }, '2026-03-10'), false); // Proficiente hoje
assert.strictEqual(revisar({ n: 3, seq: 0, rod: [], dp: '2026-03-10' }, '2026-03-11'), true); // há 1+ dia
assert.strictEqual(revisar({ n: 2, seq: 0, rod: [{ d: 'a', a: 3, q: 1 }], dp: null }, '2026-03-11'), true); // caiu
assert.strictEqual(revisar({ n: 4, seq: 0, rod: [{ d: 'a', a: 5 }], dp: '2026-03-01' }, '2026-03-11'), false);

// proximoJogo
const DJ = [{ id: 'a', dia: 1, gerador: {} }, { id: 'b', dia: 1 }, { id: 'c', dia: 1, gerador: {} }, { id: 'd', dia: 2, gerador: {} }];
assert.strictEqual(proximoJogo(DJ, 1, null).id, 'a');
assert.strictEqual(proximoJogo(DJ, 1, { a: { n: 4 } }).id, 'c');
assert.strictEqual(proximoJogo(DJ, 1, { a: { n: 3 }, c: { n: 1 } }).id, 'c'); // menor nível primeiro
assert.strictEqual(proximoJogo(DJ, 1, { a: { n: 4 }, c: { n: 4 } }), null);
assert.strictEqual(proximoJogo(DJ, 3, null), null);
assert.strictEqual(proximoJogo(null, 1, null), null);

// validarBackup: jogo
const bj = (jogo) => ({ app: 'enem-mat', versao: 1, dados: { jogo } });
assert.strictEqual(validarBackup(bj({ a: { n: 2, seq: 3, rod: [{ d: '2026-03-10', a: 3, q: 1 }], dp: null } })), null);
assert.strictEqual(validarBackup(bj({ a: { n: 3, seq: 0, rod: [], dp: '2026-03-10' } })), null);
assert.ok(validarBackup(bj({ a: { n: 5, seq: 0, rod: [], dp: null } })));
assert.ok(validarBackup(bj({ a: { n: 1, seq: -1, rod: [], dp: null } })));
assert.ok(validarBackup(bj({ a: { n: 1, seq: 0, rod: 'x', dp: null } })));
assert.ok(validarBackup(bj({ a: { n: 1, seq: 0, rod: [{ d: 'x', a: 1 }], dp: null } })));
assert.ok(validarBackup(bj({ a: { n: 1, seq: 0, rod: [], dp: 'ontem' } })));
assert.ok(validarBackup(bj([])));

// Dominada em dia posterior com 4/5; queda só em revisão (dia seguinte)
{
  const T = true, F = false, ont = '2026-03-09', hj = '2026-03-10';
  let r = fecharRodada({ n: 3, seq: 0, rod: [], dp: ont }, [T, T, T, T, F], hj); assert.strictEqual(r.n, 4);
  r = fecharRodada({ n: 3, seq: 0, rod: [], dp: hj }, [T, T, F, T, T], hj); assert.strictEqual(r.n, 3); assert.ok(!r.rod[0].q);
  r = fecharRodada({ n: 4, seq: 5, rod: [], dp: ont }, [T, F, T, T, T], hj); assert.strictEqual(r.n, 3); assert.strictEqual(r.rod[0].q, 1);
}
// estado adulterado nunca lança
{
  const ruins = [null, undefined, 'x', 7, [], { n: 9, rod: 'x' }, { n: -3, seq: 'a', rod: [null, 1, { d: 1 }], dp: 5 }, { n: 2.7, seq: NaN }];
  for (const e of ruins) {
    const b = normE(e);
    assert.ok(Number.isInteger(b.n) && b.n >= 0 && b.n <= 4 && b.seq >= 0 && Array.isArray(b.rod) && (b.dp === null || typeof b.dp === 'string'));
    responder(e, true); fecharRodada(e, [true, true, true, true, true], '2026-03-10'); revisar(e, '2026-03-10');
    proximoJogo([{ id: 'a', dia: 1, gerador: {} }], 1, { a: e });
  }
  assert.strictEqual(normE({ n: 9 }).n, 4); assert.deepStrictEqual(normE({ rod: 'x' }).rod, []);
  proximoJogo([{ id: 'a', dia: 1, gerador: {} }], 1, 'lixo');
}
// quadro: lista de traços, undo/redo/limpar, borracha, papéis, ciclo de vida
{
  const Q = require('../js/quadro.js');
  const tr = (p, ...pts) => ({ papel: p, w: 4, pts: pts.map(([x, y]) => ({ x, y })) });
  const A = tr('text', [0.1, 0.1], [0.5, 0.1]), B = tr('accent', [0.1, 0.5], [0.5, 0.5]);
  const q = Q.q0();
  Q.commit(q, [A]); Q.commit(q, [A, B]);
  Q.desfazer(q); assert.deepStrictEqual(q.tracos, [A]);
  Q.refazer(q); assert.deepStrictEqual(q.tracos, [A, B]);
  Q.desfazer(q); Q.commit(q, [A, A]); assert.strictEqual(q.refazer.length, 0); // novo commit zera refazer
  Q.desfazer(Q.q0()); Q.refazer(Q.q0()); // vazio não lança
  const l = Q.q0(); Q.commit(l, [A, B]); Q.limpar(l);
  assert.deepStrictEqual(l.tracos, []); Q.desfazer(l); assert.deepStrictEqual(l.tracos, [A, B]); // limpar + desfazer restaura
  // borracha: acerta perto do segmento (meio, sem vértice), erra longe, mesma lista se nada atingido
  const L = [A, B];
  assert.deepStrictEqual(Q.apagaEm(L, 0.3, 0.11, 0.02), [B]);
  assert.strictEqual(Q.apagaEm(L, 0.3, 0.3, 0.02), L);
  assert.deepStrictEqual(Q.apagaEm(L, 0.7, 0.1, 0.05), L); // fora do fim do segmento
  assert.deepStrictEqual(Q.apagaEm([tr('ok', [0.2, 0.2])], 0.2, 0.2, 0.01), []); // ponto único
  const e = Q.q0(); Q.commit(e, [A, B]); const ant = e.tracos; e.tracos = Q.apagaEm(ant, 0.3, 0.1, 0.02); Q.fimApaga(e, ant);
  Q.desfazer(e); assert.deepStrictEqual(e.tracos, [A, B]);
  // teto do histórico: 100 passos, o mais antigo sai
  const H = Q.q0(); for (let i = 0; i < Q.MAX_HIST + 20; i++) Q.commit(H, [tr('ok', [i / 1000, 0.1])]);
  assert.strictEqual(H.hist.length, Q.MAX_HIST); assert.strictEqual(Q.MAX_HIST, 100);
  const H2 = Q.q0(); H2.hist = Array.from({ length: Q.MAX_HIST }, () => []); H2.tracos = [A]; const ant2 = H2.tracos; H2.tracos = []; Q.fimApaga(H2, ant2);
  assert.strictEqual(H2.hist.length, Q.MAX_HIST); assert.strictEqual(H2.hist[Q.MAX_HIST - 1], ant2); // borracha também respeita o teto
  // aviso "Quadro limpo": só vale enquanto o quadro está como a limpeza deixou
  const Z = Q.q0(); Q.commit(Z, [A, B]); Q.limpar(Z); const marca = Z.tracos;
  assert.ok(Q.avisoValido(Z, marca)); assert.ok(!Q.avisoValido(Z, null));
  Q.commit(Z, [A]); assert.ok(!Q.avisoValido(Z, marca)); // novo traço invalida
  Q.desfazer(Z); assert.ok(Q.avisoValido(Z, marca)); // voltou exatamente ao estado da limpeza (a interface esconde o aviso na 1ª mudança e ele não reaparece)
  Q.desfazer(Z); assert.ok(!Q.avisoValido(Z, marca)); // desfazer a limpeza invalida
  // papéis -> var CSS -> cor
  assert.deepStrictEqual(Object.keys(Q.PAPEIS), ['text', 'accent', 'danger', 'ok', 'warn']);
  assert.strictEqual(Q.corDe('danger', (v) => ({ '--danger': ' red ' })[v]), 'red');
  assert.strictEqual(Q.corDe('xyz', (v) => v), '--text');
  // palma
  assert.ok(Q.ignorar('touch', 10, 10, true)); assert.ok(Q.ignorar('touch', 50, 5, false));
  assert.ok(!Q.ignorar('touch', 10, 10, false)); assert.ok(!Q.ignorar('pen', 90, 90, true)); assert.ok(!Q.ignorar('mouse', 90, 90, true));
  // ciclo de vida: chave não pedida entre inicio/fim é destruída; re-pedida mantém o traço
  const mortos = [];
  const R = Q.criarRegistro((k) => { const o = Q.q0(); o.k = k; return o; }, (o) => mortos.push(o.k));
  R.inicio(); const a1 = R.obter('a'); R.obter('b'); R.fim();
  Q.commit(a1, [A]);
  R.inicio(); const a2 = R.obter('a'); R.fim();
  assert.strictEqual(a2, a1); assert.deepStrictEqual(a2.tracos, [A]); assert.deepStrictEqual(mortos, ['b']); assert.deepStrictEqual([...R.mapa.keys()], ['a']);
  R.obter('c'); R.fim(); assert.deepStrictEqual([...R.mapa.keys()], ['a', 'c']); // fora de inicio/fim não varre
  R.inicio(); R.fim(); assert.strictEqual(R.mapa.size, 0); assert.deepStrictEqual(mortos, ['b', 'a', 'c']);
}
console.log('mat_test: OK');
