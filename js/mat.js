/* ENEM Matemática. Todo texto entra por nós DOM (h/createTextNode), nunca por HTML de dado. */
'use strict';

/* ---------- funções puras (testadas em tools/mat_test.js) ---------- */
const INTERVALOS = [0, 1, 2, 4]; // dias por caixa 1..4; 0 = volta ao fim da fila de hoje
const MAX_NOVOS = 15;
const pad = (n) => String(n).padStart(2, '0');
const partes = (s) => s.split('-').map(Number);

/** Data LOCAL AAAA-MM-DD (nunca toISOString: viraria UTC). */
function hoje(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDias(s, n) { const [y, m, d] = partes(s); return hoje(new Date(y, m - 1, d + n)); }
function difDias(a, b) {
  const [y1, m1, d1] = partes(a), [y2, m2, d2] = partes(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function diaPlano(inicio, h = hoje()) { return Math.min(6, Math.max(1, difDias(inicio, h) + 1)); }
function planoConcluido(inicio, h = hoje()) { return difDias(inicio, h) >= 6; }

/** Leitner 4 caixas: Errei -> cx1; Quase fica; Acertei sobe (teto cx4). due = hoje + intervalo da caixa. */
function proxima(card, nota, h = hoje()) {
  const c = card || { cx: 1, n: 0 };
  let cx = c.cx;
  if (nota === 'errei') cx = 1;
  else if (nota === 'acertei') cx = Math.min(4, cx + 1);
  return { ...c, cx, due: addDias(h, INTERVALOS[cx - 1]), n: (c.n || 0) + 1, ini: c.ini || h };
}

/** Intercala: nunca 2 seguidos do mesmo tópico (t) quando houver outro; pega do tópico mais frequente. */
function fila(itens) {
  const rest = itens.slice(), out = [];
  let last = null;
  while (rest.length) {
    const cont = {};
    rest.forEach((x) => { cont[x.t] = (cont[x.t] || 0) + 1; });
    let pick = -1, best = 0;
    rest.forEach((x, i) => { if (x.t !== last && cont[x.t] > best) { best = cont[x.t]; pick = i; } });
    if (pick < 0) pick = 0;
    const [x] = rest.splice(pick, 1);
    out.push(x); last = x.t;
  }
  return out;
}

/** Sequência honesta: só dias com meta cumprida; hoje ainda em aberto não zera. */
function sequencia(dias, meta, h = hoje()) {
  const m = Math.max(1, meta), ok = (d) => (dias[d] || 0) >= m;
  let d = ok(h) ? h : addDias(h, -1), atual = 0;
  while (ok(d)) { atual++; d = addDias(d, -1); }
  let melhor = 0, run = 0, prev = null;
  Object.keys(dias).sort().filter(ok).forEach((k) => {
    run = prev && difDias(prev, k) === 1 ? run + 1 : 1; prev = k; melhor = Math.max(melhor, run);
  });
  return { atual, melhor: Math.max(melhor, atual) };
}

/** Mini-notação -> árvore: {a/b} x^{2} x_{1} sqrt{x}. */
function sorteio(pool, n = 10, rnd = Math.random) { // Fisher-Yates; no máximo n itens distintos
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
function parse(src) {
  const s = String(src);
  let i = 0;
  function seq(stops) {
    const out = [];
    let buf = '';
    const flush = () => { if (buf) { out.push({ t: 'txt', v: buf }); buf = ''; } };
    while (i < s.length && !stops.includes(s[i])) {
      const c = s[i];
      if ((c === '^' || c === '_') && s[i + 1] === '{') {
        flush(); i += 2; out.push({ t: c === '^' ? 'sup' : 'sub', c: seq('}') }); i++;
      } else if (s.startsWith('sqrt{', i)) {
        flush(); i += 5; out.push({ t: 'sqrt', c: seq('}') }); i++;
      } else if (c === '{') {
        flush(); i++;
        const a = seq('/}');
        if (s[i] === '/') { i++; const b = seq('}'); i++; out.push({ t: 'frac', a, b }); } else { i++; out.push(...a); }
      } else { buf += c; i++; }
    }
    flush();
    return out;
  }
  return seq('');
}

/** Valida um backup (objeto já parseado). Devolve mensagem de erro ou null. */
const CHAVES = ['cards', 'licoes', 'caderno', 'dias', 'meta', 'inicio', 'jogo'];
function validarBackup(b) {
  const obj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!obj(b) || b.app !== 'enem-mat' || b.versao !== 1 || !obj(b.dados)) return 'Arquivo não é um backup de Matemática.';
  const d = b.dados;
  for (const k of Object.keys(d)) if (!CHAVES.includes(k)) return `Chave desconhecida: ${k}.`;
  if ('cards' in d && !(obj(d.cards) && Object.values(d.cards).every((c) => obj(c) && Number.isInteger(c.cx) && c.cx >= 1 && c.cx <= 4 && typeof c.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.due)))) return 'Cartões inválidos.';
  if ('licoes' in d && !(obj(d.licoes) && Object.values(d.licoes).every((l) => obj(l) && (!('ex' in l) || Array.isArray(l.ex))))) return 'Lições inválidas.';
  if ('caderno' in d && !(Array.isArray(d.caderno) && d.caderno.every((x) => obj(x) && typeof x.ref === 'string' && typeof x.causa === 'string' && typeof x.data === 'string'))) return 'Caderno inválido.';
  if ('dias' in d && !(obj(d.dias) && Object.values(d.dias).every((n) => Number.isFinite(n)))) return 'Dias inválidos.';
  if ('meta' in d && !(Number.isFinite(d.meta) && d.meta > 0)) return 'Meta inválida.';
  if ('inicio' in d && !(typeof d.inicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.inicio))) return 'Data de início inválida.';
  const data = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
  if ('jogo' in d && !(obj(d.jogo) && Object.values(d.jogo).every((e) => obj(e) && Number.isInteger(e.n) && e.n >= 0 && e.n <= 4 && Number.isInteger(e.seq) && e.seq >= 0
    && Array.isArray(e.rod) && e.rod.every((r) => obj(r) && data(r.d) && Number.isInteger(r.a) && r.a >= 0 && r.a <= 5) && (e.dp == null || data(e.dp))))) return 'Jogo inválido.';
  return null;
}

/** Folha de fórmulas do dia: cartões únicos {titulo, formula, uso} na ordem dos tópicos. Prefere t.formulas {nome, f, uso}; senão uso = 1º sinal de quando (ou null). */
function folha(D, dia) {
  const vistos = new Set(), out = [];
  (D || []).filter((t) => t.dia === dia).forEach((t) => {
    const add = (titulo, f, uso) => { if (f && !vistos.has(f)) { vistos.add(f); out.push({ titulo, formula: f, uso }); } };
    if (Array.isArray(t.formulas) && t.formulas.length) { t.formulas.forEach((x) => add(x.nome, x.f, x.uso || null)); return; }
    const q = t.quando, uso = (q && q.sinais && q.sinais[0]) || null;
    [q && q.formula, ...(t.exemplos || []).map((e) => e.formula)].forEach((f) => add(t.titulo, f, uso));
  });
  return out;
}

/* ---------- motor do jogo (puro; contas geradas, nunca eval/Function) ---------- */
const ARIDADE = { sqrt: [1, 1], log: [1, 2], log10: [1, 1], comb: [2, 2], factorial: [1, 1] }; // mesma whitelist de tools/check.py
const naoNeg = (n) => Number.isInteger(n) && n >= 0 && n <= 170;
const fin = (v) => { if (!Number.isFinite(v)) throw new Error('resultado não finito'); return v; };
const FUNCS = {
  sqrt: (x) => Math.sqrt(x),
  log: (x, b) => (b === undefined ? Math.log(x) : Math.log(x) / Math.log(b)),
  log10: (x) => Math.log10(x),
  factorial: (n) => { if (!naoNeg(n)) throw new Error('factorial inválido'); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  comb: (n, k) => {
    if (!naoNeg(n) || !naoNeg(k)) throw new Error('comb inválido');
    if (k > n) return 0;
    const m = Math.min(k, n - k); let r = 1;
    for (let i = 0; i < m; i++) r = r * (n - i) / (i + 1);
    return Math.round(r);
  },
};

/** Avalia expr aritmética: + - * / ** ( ) , unário, pi, FUNCS e variáveis de env. Erro = throw. */
function calcula(expr, env = {}) {
  const src = String(expr), tk = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|[-+*/(),]))/y;
  let p = 0;
  while (p < src.length) {
    if (/^\s*$/.test(src.slice(p))) break;
    re.lastIndex = p;
    const m = re.exec(src);
    if (!m) throw new Error(`caractere inválido em "${src}"`);
    tk.push(m[1] !== undefined ? { n: Number(m[1]) } : m[2] !== undefined ? { id: m[2] } : { op: m[3] });
    p = re.lastIndex;
  }
  let i = 0;
  const op = (o) => tk[i] && tk[i].op === o;
  const quer = (o) => { if (!op(o)) throw new Error(`esperado ${o}`); i++; };
  function expr1() {
    let v = termo();
    while (op('+') || op('-')) { const o = tk[i++].op; const b = termo(); v = fin(o === '+' ? v + b : v - b); }
    return v;
  }
  function termo() {
    let v = unario();
    while (op('*') || op('/')) {
      const o = tk[i++].op, b = unario();
      if (o === '/' && b === 0) throw new Error('divisão por zero');
      v = fin(o === '*' ? v * b : v / b);
    }
    return v;
  }
  function unario() {
    if (op('-')) { i++; return -unario(); }
    if (op('+')) { i++; return unario(); }
    return potencia();
  }
  function potencia() { // ** liga mais que o unário à esquerda e é associativo à direita (como no Python)
    const a = atomo();
    if (!op('**')) return a;
    i++;
    const b = unario();
    if (Math.abs(b) > 100) throw new Error('expoente grande');
    if (a === 0 && b < 0) throw new Error('divisão por zero');
    return fin(a ** b);
  }
  function atomo() {
    const t = tk[i++];
    if (!t) throw new Error('expressão incompleta');
    if (t.n !== undefined) return t.n;
    if (t.op === '(') { const v = expr1(); quer(')'); return v; }
    if (t.id !== undefined) {
      if (op('(')) {
        if (!Object.prototype.hasOwnProperty.call(ARIDADE, t.id)) throw new Error(`função não permitida: ${t.id}`);
        i++;
        const args = [];
        if (!op(')')) { args.push(expr1()); while (op(',')) { i++; args.push(expr1()); } }
        quer(')');
        const [lo, hi] = ARIDADE[t.id];
        if (args.length < lo || args.length > hi) throw new Error(`${t.id}: número de argumentos`);
        return fin(FUNCS[t.id](...args));
      }
      if (t.id === 'pi') return Math.PI;
      if (Object.prototype.hasOwnProperty.call(env, t.id) && Number.isFinite(env[t.id])) return env[t.id];
      throw new Error(`nome desconhecido: ${t.id}`);
    }
    throw new Error(`símbolo inesperado: ${t.op}`);
  }
  const v = expr1();
  if (i < tk.length) throw new Error('sobrou texto na expressão');
  return v;
}

/** PRNG mulberry32: seed inteira -> () => [0,1). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const arred = (x) => Math.round(x * 1e6) / 1e6;
const casasDe = (x) => { const s = String(arred(x)); return s.includes('.') ? s.split('.')[1].length : 0; };
const passa = (tipo, v) => (tipo === 'inteiro' ? Math.abs(v - Math.round(v)) <= 1e-9 : tipo === 'positivo' ? v > 0 : Math.abs(v) > 1e-9);

/** Sorteia os números da questão i (0-based) do gerador g. Devolve { vals, casas } (vals inclui derivadas e valor). Erro após 50 rejeições. */
function sortear(g, i, seed) {
  const q = g.questoes[i], vars = { ...(g.vars || {}), ...(q.vars || {}) }, deriv = { ...(g.deriv || {}), ...(q.deriv || {}) };
  const rnd = rng(seed * 31 + i);
  for (let tent = 0; tent < 50; tent++) {
    const vals = {}, casas = {};
    for (const [id, v] of Object.entries(vars)) {
      const c = v.casas || 0, step = v.step || 10 ** -c;
      const n = Math.floor((v.max - v.min) / step + 1e-9);
      vals[id] = arred(v.min + step * Math.min(n, Math.floor(rnd() * (n + 1)))); casas[id] = c;
    }
    try {
      for (const [id, ex] of Object.entries(deriv)) { vals[id] = arred(calcula(ex, vals)); casas[id] = casasDe(vals[id]); }
      if ([...(g.restricoes || []), ...(q.restricoes || [])].some(([tipo, ex]) => !passa(tipo, calcula(ex, vals)))) continue;
      const valor = calcula(q.conta, vals);
      if ((q.casas || 0) === 0 && Math.abs(valor - Math.round(valor)) > 1e-9) continue;
      if (q.negativo === false && valor < -1e-9) continue;
      vals.valor = valor; casas.valor = q.casas || 0;
      return { vals, casas };
    } catch (e) { /* combinação inválida: sorteia de novo */ }
  }
  throw new Error(`gerador sem combinação válida na questão ${i + 1}`);
}

/** Troca {id} por número pt-BR (casas da variável); após ^ _ sqrt vira {n}. {a/b} (fração) não é tocado. */
function preencher(tpl, { vals, casas }) {
  return String(tpl).replace(/\{([A-Za-z_]\w*)\}/g, (m, id, pos, s) => {
    if (!Object.prototype.hasOwnProperty.call(vals, id)) return m;
    const n = Object.is(vals[id], -0) ? 0 : vals[id];
    const t = n.toFixed(casas[id] || 0).replace('.', ',');
    return /(\^|_|sqrt)$/.test(s.slice(0, pos)) ? `{${t}}` : t;
  });
}

/** Resposta digitada -> número ou null. "1,5" "1.5" "R$ 1.234,50" "50%" "12,5 km"; "." com "," = milhar; 1 "." só = decimal; 2+ "." = milhar. */
function lerNumero(s, unidade = '') {
  const x = lerNumeroPuro(s, unidade);
  if (x !== null) return x;
  // o aluno escreveu texto junto ("168 páginas", "270 pág.", "10 × 27 = 270"): vale o ÚLTIMO número solto
  // (ignora dígito colado em letra, como cm3, e expoentes)
  const txt = String(s == null ? '' : s).replace(/−/g, '-');
  if (/^[\d\s.,-]+$/.test(txt) || /\de[+-]?\d/i.test(txt)) return null; // "1 2", "1e3": ambíguo, não adivinha
  const toks = txt.match(/(?<![\p{L}\d.,^{_])-?\d[\d.,]*/gu);
  return toks ? lerNumeroPuro(toks[toks.length - 1].replace(/[.,]+$/, ''), unidade) : null;
}
function lerNumeroPuro(s, unidade = '') {
  let t = String(s == null ? '' : s).trim().replace(/−/g, '-');
  t = t.replace(/^R\$\s*/i, '').replace(/\s*%$/, '').trim();
  const u = String(unidade || '').trim();
  if (u && t.toLowerCase().endsWith(u.toLowerCase())) t = t.slice(0, t.length - u.length).trim();
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const pt = (t.match(/\./g) || []).length, vg = (t.match(/,/g) || []).length;
  if (vg > 1) return null;
  if (vg === 1) {
    if (pt && t.indexOf('.') > t.indexOf(',')) return null; // "1,234.5": ordem en-US, ambíguo
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (pt > 1) t = t.replace(/\./g, '');
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

/** Certo se |x-valor| <= meia unidade da última casa (aceita os dois lados de um ,5). */
function confere(x, valor, casas = 0) {
  return Number.isFinite(x) && Math.abs(x - valor) <= 0.5 * 10 ** -casas + 1e-9;
}

/* Estado do tópico: { n:0-4, seq, rod:[{d,a,q?}], dp }. ok: true acerto, false erro, null = usou Dica (não acerta, não derruba). */
const E0 = { n: 0, seq: 0, rod: [], dp: null };
/** Entrada do jogo sempre válida (localStorage pode vir adulterado): n inteiro 0-4, seq número >= 0, rod array de {d,a}, dp string ou null. */
function normE(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return { ...E0, rod: [] };
  const n = Number.isFinite(e.n) ? Math.min(4, Math.max(0, Math.trunc(e.n))) : 0;
  const rod = Array.isArray(e.rod) ? e.rod.filter((r) => r && typeof r === 'object' && typeof r.d === 'string' && Number.isFinite(r.a)) : [];
  return { n, seq: Number.isFinite(e.seq) && e.seq > 0 ? e.seq : 0, rod, dp: typeof e.dp === 'string' ? e.dp : null };
}
/** Uma resposta dada: acerto soma seq, o resto zera; já é Tentada. */
function responder(e, ok) {
  const b = normE(e);
  return { ...b, n: Math.max(b.n, 1), seq: ok === true ? b.seq + 1 : 0 };
}
/** Fecha a rodada (5 oks) a partir do estado e0 ANTES dela; h = data local. */
function fecharRodada(e0, oks, h) {
  const b = normE(e0), hits = oks.filter((x) => x === true).length;
  let lider = 0; while (lider < oks.length && oks[lider] === true) lider++;
  let cauda = 0; while (cauda < oks.length && oks[oks.length - 1 - cauda] === true) cauda++;
  let n = Math.max(b.n, 1), seq = hits === oks.length ? b.seq + oks.length : cauda, dp = b.dp, q = false;
  if (b.n === 3 && hits >= 4 && dp && h > dp) n = 4; // Dominada: Proficiente há 1+ dia com 4/5
  else if (b.n >= 3 && oks.includes(false) && (b.n === 4 || h > b.dp)) { n = b.n - 1; seq = 0; q = true; } // erro em revisão (dia seguinte): 1 queda por rodada
  else if (b.n < 3 && b.seq >= 1 && lider >= 1 && b.seq + lider >= 5) { n = 3; dp = h; }
  else if (b.n < 2 && hits >= 3) n = 2;
  const rod = [...b.rod, q ? { d: h, a: hits, q: 1 } : { d: h, a: hits }].slice(-20);
  return { n, seq, rod, dp };
}
/** Tópico pede revisão: caiu de nível na última rodada, ou Proficiente há 1+ dia. */
function revisar(e, h) {
  if (!e) return false;
  const b = normE(e), ult = b.rod[b.rod.length - 1];
  return !!(ult && ult.q) || (b.n === 3 && !!b.dp && h > b.dp);
}
/** Próximo tópico jogável (com gerador) do dia: o de menor nível; null se não há ou todos Dominada. */
function proximoJogo(D, dia, J) {
  let best = null;
  (D || []).filter((t) => t.dia === dia && t.gerador).forEach((t) => {
    const n = normE((J || {})[t.id]).n;
    if (n < 4 && (!best || n < best.n)) best = { t, n };
  });
  return best ? best.t : null;
}

if (typeof module !== 'undefined') module.exports = { normE, folha, sorteio, parse, proxima, fila, hoje, diaPlano, sequencia, addDias, difDias, planoConcluido, INTERVALOS, validarBackup, calcula, rng, sortear, preencher, lerNumero, confere, responder, fecharRodada, revisar, proximoJogo };

/* ---------- interface ---------- */
if (typeof document !== 'undefined' && window.ENEM) (() => {
const { h, $, $$, store, toast, icon, skeleton, erroEstado, pronto, vazio } = window.ENEM;
const Q = window.ENEM.quadro;

const MAT_FOCO = {
  1: 'Números, porcentagem e proporção', 2: 'Gráficos, tabelas e estatística', 3: 'Funções, equações, PA, PG e logaritmo',
  4: 'Geometria plana, circunferência e escalas', 5: 'Geometria espacial, analítica e trigonometria', 6: 'Contagem e probabilidade condicional',
};
const MAT_COMP = { C1: 'Números', C2: 'Geometria', C3: 'Grandezas', C4: 'Variação', C5: 'Álgebra', C6: 'Gráficos e tabelas', C7: 'Estatística e probabilidade' };
const MAT_HAB = { C1: [1, 5], C2: [6, 9], C3: [10, 14], C4: [15, 18], C5: [19, 23], C6: [24, 26], C7: [27, 30] };
const NAT_COMP = { C1: 'Ciência e tecnologia', C2: 'Tecnologia no cotidiano', C3: 'Degradação e conservação', C4: 'Organismos e ambiente', C5: 'Métodos científicos', C6: 'Física', C7: 'Química', C8: 'Biologia' };
const NAT_HAB = { C1: [1, 3], C2: [4, 7], C3: [8, 12], C4: [13, 16], C5: [17, 19], C6: [20, 23], C7: [24, 27], C8: [28, 30] };
const HUM_COMP = { C1: 'Identidade e cultura', C2: 'Espaço geográfico', C3: 'Instituições sociais', C4: 'Técnica e trabalho', C5: 'Cidadania', C6: 'Sociedade e natureza' };
const HUM_HAB = { C1: [1, 5], C2: [6, 10], C3: [11, 15], C4: [16, 20], C5: [21, 25], C6: [26, 30] };
const FOCO2 = { 1: 'Fundamentos' };
const nova = (slug, nome, icone, area) => ({ slug, nome, icone, pre: slug + ':', dir: slug, files: ['d1'], dias: 1, area, foco: FOCO2, comp: area === 'natureza' ? NAT_COMP : HUM_COMP, habc: area === 'natureza' ? NAT_HAB : HUM_HAB });
/* registro único de matérias; escola.js só lê (window.ENEM.materias). Nova matéria = nova entrada (pre = prefixo de storage). */
const MATERIAS = {
  mat: { slug: 'mat', nome: 'Matemática', icone: 'function', pre: 'mat:', dir: 'matematica', files: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'], dias: 6, area: 'mat', foco: MAT_FOCO, comp: MAT_COMP, habc: MAT_HAB },
  fisica: nova('fisica', 'Física', 'atom', 'natureza'),
  quimica: nova('quimica', 'Química', 'flask', 'natureza'),
  biologia: nova('biologia', 'Biologia', 'dna', 'natureza'),
  geografia: nova('geografia', 'Geografia', 'globe-hemisphere-west', 'humanas'),
  historia: nova('historia', 'História', 'scroll', 'humanas'),
  filosofia: nova('filosofia', 'Filosofia', 'chats-circle', 'humanas'),
  sociologia: nova('sociologia', 'Sociologia', 'users-three', 'humanas'),
};
let M = MATERIAS.mat, H = '#' + M.slug + '/';
let FILES = M.files, FOCO = M.foco, COMP = M.comp, HAB_C = M.habc;
const DC = {}; // cache de dados por slug
const NIVEL = { basico: 'Básico', intermediario: 'Intermediário', avancado: 'Avançado' };
const CAUSAS = ['Conceito', 'Interpretação', 'Conta', 'Fórmula', 'Tempo/distração'];
const NOTAS = [['errei', 'Errei', 'x'], ['quase', 'Quase', 'warning'], ['acertei', 'Acertei', 'check']];
const TELAS = { trilha: 'Trilha', formulas: 'Fórmulas', licao: 'Lição', treino: 'Treino', caderno: 'Caderno', progresso: 'Progresso', jogo: 'Jogo' };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const live = (m) => { $('#live').textContent = m; };

/* estado: localStorage via store (prefixo enem:<M.pre>), com espelho em memória se o storage falhar */
const mem = {};
const ld = (k, d) => { if (!(M.pre + k in mem)) mem[M.pre + k] = store.get(M.pre + k, null); const v = mem[M.pre + k]; return v == null ? d : v; };
const sv = (k, v) => { mem[M.pre + k] = v; store.set(M.pre + k, v); };
let semStorage = false;
try { localStorage.setItem('enem:mat:t', '1'); localStorage.removeItem('enem:mat:t'); } catch { semStorage = true; }
function registrar(delta = 1) {
  const dias = ld('dias', {}), k = hoje();
  dias[k] = Math.max(0, (dias[k] || 0) + delta);
  if (!dias[k]) delete dias[k];
  sv('dias', dias);
}

/* fórmulas: árvore -> DOM */
const plain = (ns) => ns.map((n) => {
  if (n.t === 'txt') return n.v;
  if (n.t === 'frac') return ` ${plain(n.a)} sobre ${plain(n.b)} `;
  if (n.t === 'sup') return ` elevado a ${plain(n.c)} `;
  if (n.t === 'sub') return ` índice ${plain(n.c)} `;
  return ` raiz de ${plain(n.c)} `;
}).join('');
const dom = (ns) => ns.map((n) => {
  if (n.t === 'txt') return document.createTextNode(n.v);
  if (n.t === 'frac') {
    return h('span', { class: 'frac' }, h('span', { 'aria-hidden': 'true' }, dom(n.a)), h('span', { 'aria-hidden': 'true' }, dom(n.b)),
      h('span', { class: 'sr-only' }, plain([n])));
  }
  if (n.t === 'sup') return h('sup', {}, dom(n.c));
  if (n.t === 'sub') return h('sub', {}, dom(n.c));
  return h('span', { class: 'rad' }, h('span', { class: 'sr-only' }, 'raiz de '), h('span', { 'aria-hidden': 'true' }, '√'), h('span', {}, dom(n.c)));
});
const rich = (src) => dom(parse(src));
const formula = (src, bloco) => (bloco
  ? h('div', { class: 'mb', role: 'group', tabindex: '0', 'aria-label': 'Fórmula' }, rich(src))
  : h('span', {}, rich(src)));

/* dados */
let D = null;
async function carregar() {
  const m = M;
  const r = await Promise.all(FILES.map(async (f) => {
    const res = await fetch(`data/${m.dir}/${f}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(f + ' ' + res.status);
    return res.json();
  }));
  DC[m.slug] = r.flatMap((lista, i) => lista.map((t) => ({ ...t, dia: Number(m.files[i].slice(1)) })));
  if (M === m) D = DC[m.slug];
}
const topico = (id) => (D || []).find((t) => t.id === id);
function cartao(id) {
  const k = id.lastIndexOf(':'), t = topico(id.slice(0, k));
  return t && t.cartoes[Number(id.slice(k + 1))] ? { t, c: t.cartoes[Number(id.slice(k + 1))] } : null;
}
const quando = (due) => { const n = difDias(hoje(), due); return n <= 0 ? 'ainda hoje' : n === 1 ? 'amanhã' : `em ${n} dias`; };
const irTrilha = () => { location.hash = H + 'trilha'; };

/* sessão curta: tempo por Date.now() (sobrevive a aba em segundo plano) */
let S = ld('sessao', null), sInt = null, avisou5 = false;
const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
function tick() {
  if (!S) return;
  const resta = S.fim - Date.now();
  if (resta <= 0) { fimSessao(); return; }
  $$('.sessao time').forEach((t) => { t.textContent = fmt(resta); t.setAttribute('datetime', `PT${Math.floor(resta / 60000)}M${Math.floor(resta / 1000) % 60}S`); });
  if (!avisou5 && resta <= 300000) { avisou5 = true; if (S.fim - S.ini > 300000) live('Faltam 5 minutos.'); }
}
function ligaSessao() { clearInterval(sInt); sInt = S ? setInterval(tick, 1000) : null; }
function iniciarSessao(min) {
  S = { ini: Date.now(), fim: Date.now() + min * 60000, n: 0, ac: 0 };
  avisou5 = false; sv('sessao', S); ligaSessao(); mostrar();
}
function fimSessao() {
  if (!S) return;
  const r = S;
  S = null; sv('sessao', null); ligaSessao();
  const msg = `Sessão encerrada: ${plural(r.n, 'cartão', 'cartões')}, ${plural(r.ac, 'acerto', 'acertos')}.`;
  live(msg); toast(msg);
  if (!$('#mat').hidden) mostrar();
}
if (S && !(S.fim > Date.now())) { S = null; sv('sessao', null); }
ligaSessao();
function pill() {
  return S && h('div', { class: 'sessao' }, icon('timer'), h('time', {}, fmt(S.fim - Date.now())),
    h('button', { type: 'button', class: 'btn btn-ghost', onclick: fimSessao }, 'Encerrar'));
}
function sessaoCtl() {
  if (S) return null;
  let min = 15;
  const btn = h('button', { type: 'button', class: 'btn', onclick: () => iniciarSessao(min) }, icon('timer'), 'Sessão de 15 min');
  const sel = h('select', { 'aria-label': 'Duração da sessão', onchange: () => { min = Number(sel.value); btn.replaceChildren(icon('timer'), `Sessão de ${min} min`); } },
    [10, 15, 25].map((m) => h('option', { value: m, selected: m === 15 }, `${m} min`)));
  return h('div', { class: 'row' }, sel, btn);
}

/* trilha */
let filtroC = null;
function linha(t, licoes, jg) {
  if (jg) {
    const e = normE(jg[t.id]), rev = t.gerador && revisar(e, hoje());
    return h('li', {}, h('a', { class: 'topico', href: H + 'jogo/' + t.id },
      h('span', { class: 'topico-t' }, t.titulo),
      h('span', { class: 'topico-m' }, h('span', { class: 'tag' }, NIVEL[t.nivel]),
        t.gerador ? nivelJogo(e.n) : h('span', { class: 'jogo-nivel' }, 'Sem jogo ainda'),
        rev && h('span', { class: 'tag tag-warn' }, icon('warning'), 'revisar'))));
  }
  const l = licoes[t.id] || {};
  const concl = l.status === 'concluida';
  const est = concl ? 'Concluída' : (l.ex || []).some((x) => x != null) ? 'Em estudo' : 'Não iniciada';
  const ant = t.antes && topico(t.antes);
  return h('li', {},
    h('a', { class: 'topico', href: H + 'licao/' + t.id },
      h('span', { class: 'topico-t' }, t.titulo),
      h('span', { class: 'topico-m' },
        h('span', { class: 'tag' }, `${t.competencia} · ${t.habilidades.join(', ')}`),
        h('span', { class: 'tag' }, NIVEL[t.nivel]),
        h('span', { class: 'tag' + (concl ? ' tag-ok' : '') }, concl && icon('check'), est),
        plural(t.exercicios.length, 'exercício', 'exercícios'))),
    ant && h('p', { class: 'antes' }, 'Antes: ', h('a', { href: H + 'licao/' + ant.id }, ant.titulo)));
}
const hrefDia = (d) => { const p = proximoJogo(D, d, ldJogo()); return p ? H + 'jogo/' + p.id : H + 'jogo'; };
function listaTopicos(box, dia, fim, licoes) {
  const vis = D.filter((t) => !filtroC || t.competencia === filtroC);
  if (!vis.length) {
    box.replaceChildren(vazio('Nenhum tópico nessa competência ainda.', 'Limpar filtros', () => { filtroC = null; mostrarEm('.chips [aria-pressed="true"]'); }));
    return;
  }
  const dias = [...new Set(vis.map((t) => t.dia))].sort((a, b) => a - b);
  if (!fim && dias.includes(dia)) dias.unshift(...dias.splice(dias.indexOf(dia), 1));
  box.replaceChildren(
    ...(!filtroC && !fim && !D.some((t) => t.dia === dia) ? [h('p', { class: 'dia-foco' }, `Dia ${dia} · ${FOCO[dia]}: sem conteúdo ainda.`)] : []),
    h('div', { class: 'dias' }, dias.map((d) => h('section', {},
      h('div', { class: 'dia-cab' }, h('h2', {}, `Dia ${d} · ${FOCO[d]}`),
        h('div', { class: 'row' },
          h('a', { href: H + 'formulas/' + d, 'aria-label': `Fórmulas do dia ${d}` }, 'Fórmulas'),
          h('a', { href: hrefDia(d), 'aria-label': `Jogar o dia ${d}` }, 'Jogar o dia'))),
      !fim && d === dia && h('p', { class: 'dia-foco' }, 'Dia de hoje'),
      h('ul', { class: 'topicos' }, vis.filter((t) => t.dia === d).map((t) => linha(t, licoes)))))));
}
function telaTrilha() {
  let inicio = ld('inicio', null);
  if (!inicio) { inicio = hoje(); sv('inicio', inicio); }
  const dia = diaPlano(inicio), fim = planoConcluido(inicio);
  const meta = ld('meta', 10), dias = ld('dias', {}), licoes = ld('licoes', {});
  const feitoHoje = dias[hoje()] || 0, seq = sequencia(dias, meta), pj = proximoJogo(D, dia, ldJogo());
  const pend = (t) => (licoes[t.id] || {}).status !== 'concluida';
  const cont = D.find((t) => t.dia === dia && pend(t)) || D.find(pend);
  const ontem = Object.keys(dias).length > 0 && seq.atual === 0 && feitoHoje < meta && (dias[addDias(hoje(), -1)] || 0) < meta;
  const selMeta = h('select', { id: 'meta', onchange: () => { sv('meta', Number(selMeta.value)); mostrar(); $('#meta')?.focus({ preventScroll: true }); } },
    [5, 10, 15, 20].map((m) => h('option', { value: m, selected: m === meta }, String(m))));
  const faixa = h('section', { class: 'faixa', 'aria-label': 'Hoje' },
    h('div', {}, h('h2', {}, 'Hoje'), h('p', { class: 'faixa-dia' }, fim ? 'Plano concluído: revise o Caderno' : `Dia ${dia} de ${M.dias} · ${FOCO[dia]}`),
      h('a', { class: 'btn btn-ghost', href: H + 'formulas/' + dia }, icon('printer'), 'Folha de fórmulas do dia'),
      h('a', { class: 'btn btn-ghost', href: hrefDia(dia) }, icon('play'), 'Jogar', pj && `: ${pj.titulo}`)),
    h('div', {}, h('label', { for: 'meta' }, 'Meta diária (atividades) '), selMeta,
      h('progress', { max: meta, value: Math.min(feitoHoje, meta), 'aria-label': 'Meta de hoje' }),
      h('p', {}, `${feitoHoje} de ${meta} hoje`)),
    h('div', {}, h('p', {}, `Sequência: ${plural(seq.atual, 'dia', 'dias')}`),
      h('p', { class: 'muted' }, `Melhor: ${plural(seq.melhor, 'dia', 'dias')}`),
      ontem && h('p', { class: 'muted' }, 'Ontem sem estudo. Hoje recomeça a contar.'),
      sessaoCtl()));
  const box = h('div', {});
  const grupo = h('div', { class: 'chips', role: 'group', 'aria-label': 'Competência' },
    [null, ...Object.keys(COMP)].map((c) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(filtroC === c), onclick: () => { filtroC = c; mostrar(); $('.chips [aria-pressed="true"]')?.focus({ preventScroll: true }); } },
      c ? `${c} ${COMP[c]}` : 'Todas')));
  listaTopicos(box, dia, fim, licoes);
  return h('div', {}, faixa,
    cont ? h('p', {}, h('a', { class: 'btn btn-primary', href: H + 'licao/' + cont.id }, 'Continuar: ', cont.titulo))
      : h('p', { class: 'muted' }, 'Nenhum tópico pendente nos dias disponíveis.'),
    grupo, box);
}

/* folha de fórmulas */
function telaFormulas(arg) {
  const n = Number(arg), dia = Number.isInteger(n) && n >= 1 && n <= 6 ? n : diaPlano(ld('inicio', null) || hoje());
  const cards = folha(D, dia), tit = `Folha de fórmulas · Dia ${dia} · ${FOCO[dia]}`;
  $('#h-mat').textContent = tit;
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Dia' },
    [1, 2, 3, 4, 5, 6].map((d) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(d === dia), 'aria-current': d === dia ? 'true' : null, onclick: () => { location.hash = H + 'formulas/' + d; } }, `Dia ${d}`)));
  const imp = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => window.print() }, icon('printer'), 'Imprimir');
  if (typeof window.print !== 'function') { imp.disabled = true; imp.setAttribute('aria-disabled', 'true'); }
  return h('div', { class: 'folha' },
    h('div', { class: 'folha-topo' }, h('a', { class: 'voltar', href: H + 'trilha' }, 'Voltar à Trilha'), imp),
    chips,
    cards.length ? h('div', { class: 'formula-grade' }, cards.map((c) => h('section', { class: 'ex formula-cartao' },
      h('h2', {}, c.titulo), formula(c.formula, true), c.uso && h('p', {}, rich(c.uso)))))
      : vazio('Sem fórmulas neste dia ainda.', 'Abrir a trilha', irTrilha));
}

/* lição */
function guardar(t, i, e, causa) {
  const C = ld('caderno', []), ref = `${t.titulo} · exercício ${i + 1}`;
  if (C.some((x) => x.ref === ref && !x.refeito)) { toast('Já está no caderno'); return; }
  C.unshift({ id: Date.now().toString(36) + i, ref, enunciado: e.enunciado, causa, nota: '', data: hoje(), refeito: false, topico: t.id, c: t.competencia, hs: t.habilidades });
  sv('caderno', C); toast('Guardado no caderno');
}
function avalia(t, i, v) {
  const L = ld('licoes', {}), l = L[t.id] || { ex: [] };
  while (l.ex.length < t.exercicios.length) l.ex.push(null);
  const antes = l.ex[i];
  l.ex[i] = v;
  if (!l.status) l.status = 'estudo';
  L[t.id] = l; sv('licoes', L);
  if (antes == null) registrar();
}
function causaUI(t, i, e) {
  const sel = h('select', { 'aria-label': 'Causa do erro' }, CAUSAS.map((c) => h('option', { value: c }, c)));
  return h('div', { class: 'row' }, sel, h('button', { type: 'button', class: 'btn', onclick: () => guardar(t, i, e, sel.value) }, 'Guardar no caderno'));
}
/* quadro de rascunho: o nó é reusado entre mostrar(); aberto = padrão da 1ª vez (indefinido: aberto só a partir de 64em) */
let nRasc = 0;
function Rasc(chave, aberto) {
  const no = Q.obter(chave);
  if (!Q.suporta()) { no.hidden = false; return { no, btn: h('span', { hidden: true }) }; } // sem suporte: só a nota "Use papel"
  if (!no.id) no.id = 'rasc' + (++nRasc);
  if (!('pronto' in no.dataset)) { no.dataset.pronto = ''; no.hidden = !(aberto === undefined ? matchMedia('(min-width: 64em)').matches : aberto); }
  const btn = h('button', { type: 'button', class: 'btn', 'aria-expanded': String(!no.hidden), 'aria-controls': no.id, onclick: () => abreRasc(no, btn, no.hidden) }, icon('pencil-simple'), 'Rascunho');
  return { no, btn };
}
function abreRasc(no, btn, v) {
  no.hidden = !v; btn.setAttribute('aria-expanded', String(v));
  if (!v || matchMedia('(min-width: 64em)').matches) return;
  // celular: o painel é fixo embaixo; rola a questão para o topo para ela ficar visível acima do quadro
  const alvo = no.closest('.q-par')?.querySelector('.q-par-q') || btn.parentElement;
  if (alvo) scrollBy({ top: alvo.getBoundingClientRect().top - 8 * parseFloat(getComputedStyle(document.documentElement).fontSize), behavior: 'auto' });
}
/* grade questão | quadro (a partir de 64em); col = conteúdo da questão */
const par = (r, ...col) => h('div', { class: 'q-par' }, h('div', { class: 'q-par-q' }, ...col), r.no);
function exercicio(t, e, i) {
  const modo = i === 0 ? 'completo' : i === 1 ? 'parcial' : 'livre';
  const visiveis = modo === 'completo' ? e.passos : modo === 'parcial' ? e.passos.slice(0, -1) : [];
  const oculto = modo === 'completo' ? [] : modo === 'parcial' ? e.passos.slice(-1) : e.passos;
  const atual = ((ld('licoes', {})[t.id] || {}).ex || [])[i];
  const extra = h('div', {});
  const guardarUI = () => causaUI(t, i, e);
  const btns = NOTAS.map(([, rot, ic], v) => h('button', {
    type: 'button', class: 'btn', 'aria-pressed': String(atual === v),
    onclick: () => {
      avalia(t, i, v);
      btns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === v)));
      extra.replaceChildren(...(v === 0 ? [guardarUI()] : []));
      live(`Registrado: ${rot}.`);
    },
  }, icon(ic), rot));
  if (atual === 0) extra.append(guardarUI());
  const r = Rasc(`l:${t.id}:${i}`, false);
  return h('div', { class: 'ex' },
    h('p', { class: 'ex-modo' }, `Exercício ${i + 1} · ${modo === 'completo' ? 'passos à vista' : modo === 'parcial' ? 'complete o último passo' : 'resolva sozinho'}`),
    h('p', { class: 'enun' }, rich(e.enunciado)),
    visiveis.length > 0 && h('ol', {}, visiveis.map((p) => h('li', {}, rich(p)))),
    h('details', {}, h('summary', {}, 'Ver resolução'),
      h('div', { class: 'det-body' },
        oculto.length > 0 && h('ol', { start: visiveis.length + 1 }, oculto.map((p) => h('li', {}, rich(p)))),
        h('p', {}, h('strong', {}, 'Resposta: '), rich(e.resposta)))),
    h('div', { class: 'aval', role: 'group', 'aria-label': 'Como foi' }, btns),
    extra, h('p', {}, r.btn), r.no);
}
function concluir(t) {
  const L = ld('licoes', {}), l = L[t.id] || { ex: [] };
  l.status = 'concluida'; L[t.id] = l; sv('licoes', L);
  const C = ld('cards', {});
  let novos = 0;
  t.cartoes.forEach((_, i) => { const id = `${t.id}:${i}`; if (!C[id]) { C[id] = { cx: 1, due: hoje(), n: 0 }; novos++; } });
  sv('cards', C);
  toast(`Lição concluída. ${plural(novos, 'cartão criado', 'cartões criados')}.`);
}
const PAPEL = { pede: 'Pede', dado: 'Dado', distracao: 'Distração', unidade: 'Unidade', condicao: 'Condição' };
function enunciado(txt, notas) {
  const pos = notas.map((a) => ({ a, i: txt.indexOf(a.trecho) })).filter((x) => x.i >= 0).sort((x, y) => x.i - y.i);
  const out = [];
  let cur = 0;
  pos.forEach(({ a, i }) => {
    if (i < cur) return;
    out.push(rich(txt.slice(cur, i)), h('mark', { class: 'trecho t-' + a.papel }, rich(a.trecho)), h('small', { class: 'papel' }, ' ' + PAPEL[a.papel]));
    cur = i + a.trecho.length;
  });
  out.push(rich(txt.slice(cur)));
  return h('p', { class: 'enun' }, out.flat());
}
function blocoQuando(q) {
  return [h('h2', {}, 'Quando usar'),
    h('ul', {}, q.sinais.map((x) => h('li', {}, rich(x)))),
    formula(q.formula, true),
    h('div', { class: 'erro-comum' }, h('p', { class: 'rot' }, icon('warning'), 'Armadilhas'),
      h('ul', {}, q.armadilhas.map((x) => h('li', {}, rich(x)))))];
}
function blocoLer(l) {
  return [h('h2', {}, 'Como ler a questão'),
    h('ol', {}, l.passos.map((x) => h('li', {}, rich(x)))),
    h('div', { class: 'ex' }, enunciado(l.exemplo.enunciado, l.exemplo.anotacoes),
      h('ul', {}, l.exemplo.anotacoes.map((a) => h('li', {}, '“', rich(a.trecho), `” → ${PAPEL[a.papel]}: `, rich(a.nota)))))];
}
function telaLicao(id) {
  const t = topico(id);
  if (!t) { $('#h-mat').textContent = 'Lição'; return vazio('Lição não encontrada.', 'Abrir a trilha', irTrilha); }
  $('#h-mat').textContent = t.titulo;
  document.title = `${t.titulo} · ENEM ${M.nome}`;
  const concl = (ld('licoes', {})[t.id] || {}).status === 'concluida';
  return h('article', { class: 'licao' },
    h('header', {},
      h('a', { class: 'voltar', href: H + 'trilha' }, 'Voltar à Trilha'),
      t.gerador && h('p', {}, h('a', { class: 'btn btn-ghost', href: H + 'jogo/' + t.id }, icon('play'), 'Jogar este tópico')),
      h('p', { class: 'muted' }, `${t.competencia} ${COMP[t.competencia]} · ${t.habilidades.join(', ')} · ${NIVEL[t.nivel]} · Dia ${t.dia} · cerca de ${5 + 3 * t.exercicios.length} min`)),
    h('details', { class: 'pre' }, h('summary', {}, 'Antes de ler: tente lembrar'),
      h('div', { class: 'det-body' }, h('p', { class: 'enun' }, rich(t.cartoes[0].p)))),
    h('h2', {}, 'Conceito'),
    t.conceito.map((p) => h('p', {}, rich(p))),
    ...(t.quando ? blocoQuando(t.quando) : []),
    ...(t.ler ? blocoLer(t.ler) : []),
    h('h2', {}, 'Exemplo resolvido'),
    t.exemplos.map((e) => h('div', {}, h('p', { class: 'enun' }, rich(e.enunciado)),
      e.formula && formula(e.formula, true),
      h('ol', {}, e.passos.map((p) => h('li', {}, rich(p)))))),
    h('div', { class: 'exemplo' }, h('p', { class: 'rot' }, icon('lightbulb'), 'Truque'), h('p', {}, rich(t.truque))),
    h('div', { class: 'erro-comum' }, h('p', { class: 'rot' }, icon('warning'), 'Erro comum'), h('p', {}, rich(t.erroComum))),
    h('h2', {}, 'Exercícios'),
    t.exercicios.map((e, i) => exercicio(t, e, i)),
    h('div', { class: 'licao-fim' }, concl
      ? [h('span', { class: 'tag tag-ok' }, icon('check'), 'Lição concluída'), h('a', { class: 'btn', href: H + 'treino' }, 'Ir para o Treino')]
      : h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { concluir(t); mostrarEm('.licao-fim a'); } }, 'Concluir lição')));
}

/* treino: Leitner [0,1,2,4], fila misturada, desfazer */
let T = null, modoT = 'misto', topicoT = null;
function montarFila() {
  const C = ld('cards', {}), h0 = hoje();
  const limite = Math.max(0, MAX_NOVOS - Object.values(C).filter((c) => c.ini === h0).length);
  const revs = [], novos = [];
  Object.entries(C).forEach(([id, c]) => {
    const inf = cartao(id);
    if (!inf || (modoT === 'um' && topicoT && inf.t.id !== topicoT)) return;
    const it = { id, t: inf.t.id, due: c.due };
    if (c.n > 0) { if (c.due <= h0) revs.push(it); } else novos.push(it);
  });
  revs.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  return { itens: fila(revs.concat(novos.slice(0, limite))), extras: novos.slice(limite), nRev: revs.length, nNov: Math.min(limite, novos.length) };
}
let nT = 0; // contador de filas: chave do quadro única mesmo após T ser refeito
const novaT = (m) => { T = { id: ++nT, fila: m.itens.slice(), i: 0, rev: false, hist: [], reentrou: new Set(), extras: m.extras, nRev: m.nRev, nNov: m.nNov }; };
function foco() { const el = T && (T.rev ? $('.aval button') : $('#t-rev')); if (el) el.focus({ preventScroll: true }); }
function revelar() { T.rev = true; mostrar(); foco(); }
function avaliarT(nota) {
  const it = T.fila[T.i], C = ld('cards', {}), antes = C[it.id] ? { ...C[it.id] } : null;
  const novo = proxima(C[it.id], nota);
  C[it.id] = novo; sv('cards', C);
  const reent = novo.due <= hoje() && !T.reentrou.has(it.id);
  if (reent) { T.reentrou.add(it.id); T.fila.push(it); }
  registrar();
  if (S) { S.n++; if (nota === 'acertei') S.ac++; sv('sessao', S); }
  T.hist.push({ it, antes, reent, i: T.i, nota });
  T.i++; T.rev = false;
  live(`Registrado: ${cap(nota)}. Próxima revisão ${quando(novo.due)}.`);
  mostrar(); foco();
}
function desfazer() {
  const u = T.hist.pop();
  if (!u) return;
  const C = ld('cards', {});
  if (u.antes) C[u.it.id] = u.antes;
  sv('cards', C);
  if (u.reent) { T.reentrou.delete(u.it.id); const k = T.fila.lastIndexOf(u.it); if (k > u.i) T.fila.splice(k, 1); }
  registrar(-1);
  if (S) { S.n = Math.max(0, S.n - 1); if (u.nota === 'acertei') S.ac = Math.max(0, S.ac - 1); sv('sessao', S); }
  T.i = u.i; T.rev = false;
  live('Última avaliação desfeita.');
  mostrar(); foco();
}
function proxRev() {
  const ds = Object.values(ld('cards', {})).filter((c) => c.due > hoje()).map((c) => c.due).sort();
  return ds.length ? quando(ds[0]) : 'nenhuma agendada';
}
const comCartao = () => [...new Set(Object.keys(ld('cards', {})).map((id) => cartao(id)).filter(Boolean).map((x) => x.t))];
function mudaModo(m) {
  modoT = m; T = null; SIM = null;
  if (m === 'um' && !topicoT) { const c = comCartao(); if (c.length) topicoT = c[0].id; }
  mostrar();
}
const modoChips = () => h('div', { class: 'chips', role: 'group', 'aria-label': 'Modo' },
  [['misto', 'Misturado'], ['um', 'Um tópico'], ['simulado', 'Simulado']].map(([m, r]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(modoT === m), onclick: () => mudaModo(m) }, r)));

/* simulado: 10 exercícios livres (índice 2+) sorteados dos dias carregados */
let SIM = null;
function novoSim() {
  const pool = [];
  D.forEach((t) => t.exercicios.forEach((e, i) => { if (i >= 2) pool.push({ t, e, i }); }));
  SIM = { q: sorteio(pool), i: 0, rev: false, res: [] };
}
function respSim(ok) {
  SIM.res.push(ok); SIM.i++; SIM.rev = false; registrar();
  live(ok ? 'Registrado: Acertei.' : 'Registrado: Errei.');
  mostrar(); const b = $('#s-rev'); if (b) b.focus({ preventScroll: true });
}
function telaSimulado() {
  if (!SIM) novoSim();
  const s = SIM, n = s.q.length, barra = h('div', { class: 'treino-barra' }, modoChips());
  if (!n) return h('div', {}, barra, vazio('Nenhum exercício disponível ainda.'));
  if (s.i >= n) {
    const ac = s.res.filter(Boolean).length, erros = s.q.filter((_, k) => !s.res[k]);
    return h('div', {}, barra,
      h('div', { class: 'state' }, h('p', {}, h('strong', {}, `Simulado concluído: acertos ${ac} de ${n}`)),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { SIM = null; mostrarEm('#s-rev'); } }, 'Novo simulado')),
      erros.length > 0 && h('div', {}, h('h2', {}, 'Errei'),
        erros.map((q) => h('div', { class: 'ex' }, h('p', { class: 'muted' }, `${q.t.titulo} · exercício ${q.i + 1}`), h('p', { class: 'enun' }, rich(q.e.enunciado)), causaUI(q.t, q.i, q.e)))));
  }
  const { e } = s.q[s.i];
  const aval = h('div', { class: 'aval', role: 'group', 'aria-label': 'Como foi' },
    NOTAS.filter(([k]) => k !== 'quase').map(([k, rot, ic]) => h('button', { type: 'button', class: 'btn' + (k === 'acertei' ? ' btn-primary' : ''), onclick: () => respSim(k === 'acertei') }, icon(ic), rot)));
  const r = Rasc(`s:${s.i}`);
  return h('div', {}, barra, par(r,
    h('p', { class: 'muted' }, `Questão ${s.i + 1} de ${n}`),
    h('progress', { max: n, value: s.i, 'aria-label': 'Progresso do simulado' }),
    h('div', { class: 'treino-card' },
      h('p', { class: 'enun' }, rich(e.enunciado)),
      s.rev ? h('div', { class: 'resposta' }, h('ol', {}, e.passos.map((p) => h('li', {}, rich(p)))), h('p', {}, h('strong', {}, 'Resposta: '), rich(e.resposta)), aval)
        : h('button', { type: 'button', class: 'btn btn-primary', id: 's-rev', onclick: () => { s.rev = true; mostrar(); const b = $('.aval button'); if (b) b.focus({ preventScroll: true }); } }, 'Ver resolução')),
    h('p', {}, r.btn)));
}
function telaTreino() {
  const C = ld('cards', {});
  if (modoT === 'simulado') return telaSimulado();
  if (!Object.keys(C).length) return h('div', {}, h('div', { class: 'treino-barra' }, modoChips()), vazio('Nenhum cartão ainda. Conclua uma lição para criar cartões.', 'Abrir a trilha', irTrilha));
  if (!T) novaT(montarFila());
  const cc = comCartao();
  const selT = modoT === 'um' && h('select', { 'aria-label': 'Tópico', onchange: () => { topicoT = selT.value; T = null; mostrar(); } },
    cc.map((t) => h('option', { value: t.id, selected: t.id === topicoT }, t.titulo)));
  const barra = h('div', { class: 'treino-barra' },
    h('p', { class: 'muted' }, `Hoje: ${T.nRev} revisar · ${T.nNov} novos`),
    modoChips(),
    selT, sessaoCtl());
  if (T.i >= T.fila.length) {
    const extras = T.extras.slice(0, 5);
    return h('div', {}, barra, vazio(`${T.fila.length ? 'Fila de hoje concluída' : 'Nada para revisar hoje'}. Próxima revisão: ${proxRev()}.`,
      extras.length ? 'Treinar 5 novos' : null,
      () => { novaT({ itens: fila(extras), extras: T.extras.slice(5), nRev: 0, nNov: extras.length }); mostrar(); foco(); }),
    h('p', {}, h('button', { type: 'button', class: 'btn btn-ghost', disabled: !T.hist.length, onclick: desfazer }, 'Desfazer última')));
  }
  const it = T.fila[T.i], { t, c } = cartao(it.id);
  const resp = h('div', { class: 'resposta' }, h('p', {}, rich(c.r)),
    h('div', { class: 'aval', role: 'group', 'aria-label': 'Como foi' },
      NOTAS.map(([n, rot, ic]) => h('button', { type: 'button', class: 'btn' + (n === 'acertei' ? ' btn-primary' : ''), onclick: () => avaliarT(n) }, icon(ic), rot))));
  const r = Rasc(`t:${T.id}:${it.id}:${T.i}`);
  return h('div', {}, barra, par(r,
    h('p', { class: 'muted' }, `Cartão ${T.i + 1} de ${T.fila.length}`),
    h('progress', { max: T.fila.length, value: T.i, 'aria-label': 'Progresso da fila' }),
    h('div', { class: 'treino-card' },
      T.rev && h('p', { class: 'treino-top' }, `${t.titulo} · ${t.competencia} · caixa ${C[it.id].cx}`),
      h('p', { class: 'enun' }, rich(c.p)),
      T.rev ? resp : h('button', { type: 'button', class: 'btn btn-primary', id: 't-rev', onclick: revelar }, 'Mostrar resposta')),
    h('p', {}, r.btn),
    h('p', {}, h('button', { type: 'button', class: 'btn btn-ghost', disabled: !T.hist.length, onclick: desfazer }, 'Desfazer última')),
    h('p', { class: 'atalhos' }, 'Atalhos: Espaço mostra a resposta; 1, 2 e 3 avaliam.')));
}
document.addEventListener('keydown', (e) => {
  if (!T || $('#mat').hidden || e.ctrlKey || e.metaKey || e.altKey || !matchMedia('(hover: hover)').matches) return;
  const alvo = e.target.closest ? e.target : document.body;
  if (alvo.closest('input, select, textarea, .q-quadro-no') || T.i >= T.fila.length) return;
  if (e.key === ' ' && !T.rev && !alvo.closest('button, a, summary')) { e.preventDefault(); revelar(); }
  else if (T.rev && '123'.includes(e.key) && e.key.length === 1) avaliarT(NOTAS[Number(e.key) - 1][0]);
});

/* caderno */
let filtroCausa = null, addAberto = false;
const dataBR = (d) => String(d || '').split('-').reverse().join('/');
function salvarQuestao(enun, causa, comp) {
  const C = ld('caderno', []);
  C.unshift({ id: Date.now().toString(36), ref: 'Questão avulsa', enunciado: enun, causa, nota: '', data: hoje(), refeito: false, topico: null, c: comp || null, hs: [] });
  sv('caderno', C); toast('Guardado no caderno');
}
function formQuestao() {
  const enun = h('textarea', { id: 'q-enun', rows: '3' });
  const causa = h('select', { id: 'q-causa' }, CAUSAS.map((c) => h('option', { value: c }, c)));
  const comp = h('select', { id: 'q-comp' }, h('option', { value: '' }, 'Sem competência'), Object.keys(COMP).map((c) => h('option', { value: c }, `${c} ${COMP[c]}`)));
  return h('form', {
    class: 'form-q',
    onsubmit: (e) => {
      e.preventDefault();
      if (!enun.value.trim()) { toast('Escreva o enunciado ou a referência.'); enun.focus(); return; }
      salvarQuestao(enun.value.trim(), causa.value, comp.value);
      addAberto = false; mostrarEm('#q-abrir');
    },
  }, h('label', { for: 'q-enun' }, 'Enunciado ou referência'), enun,
  h('label', { for: 'q-causa' }, 'Causa do erro'), causa,
  h('label', { for: 'q-comp' }, 'Competência'), comp,
  h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn' }, 'Salvar'),
    h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { addAberto = false; mostrarEm('#q-abrir'); } }, 'Cancelar')));
}
function entrada(x) {
  const t = x.topico && topico(x.topico);
  const refazer = () => {
    const C = ld('caderno', []), it = C.find((y) => y.id === x.id);
    if (!it) return;
    it.refeito = !it.refeito; sv('caderno', C); mostrarEm(`.entrada[data-ent="${CSS.escape(x.id)}"] .btn`);
  };
  return h('li', { class: 'entrada', 'data-ent': x.id },
    h('p', {}, h('strong', {}, x.ref)),
    h('p', { class: 'enun' }, x.topico ? rich(x.enunciado) : x.enunciado),
    h('p', {}, h('span', { class: 'tag tag-warn' }, x.causa),
      x.c && h('span', { class: 'tag' }, [x.c, ...(x.hs || [])].join(' · ')),
      h('span', { class: 'muted' }, ' ' + dataBR(x.data)),
      x.refeito && h('span', { class: 'tag tag-ok' }, icon('check'), 'Refeito')),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', 'aria-pressed': String(!!x.refeito), onclick: refazer }, x.refeito ? 'Desmarcar refeito' : 'Refiz'),
      t && h('a', { class: 'btn btn-ghost', href: H + 'licao/' + t.id }, 'Rever a lição')));
}
function telaCaderno() {
  const C = ld('caderno', []);
  const vis = C.filter((x) => !filtroCausa || x.causa === filtroCausa);
  const abrir = h('button', { type: 'button', class: 'btn btn-primary', id: 'q-abrir', 'aria-expanded': String(addAberto), onclick: () => { addAberto = !addAberto; mostrar(); const q = $('#q-enun'); if (q) q.focus(); } }, 'Adicionar questão');
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Causa' },
    [null, ...CAUSAS].map((c) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(filtroCausa === c), onclick: () => { filtroCausa = c; mostrar(); $('.chips [aria-pressed="true"]')?.focus({ preventScroll: true }); } }, c || 'Todas')));
  return h('div', {}, h('p', {}, abrir), addAberto && formQuestao(),
    C.length > 0 && chips,
    !C.length ? vazio('Nenhuma questão guardada.')
      : !vis.length ? vazio('Nenhuma questão com essa causa.', 'Limpar filtros', () => { filtroCausa = null; mostrarEm('.chips [aria-pressed="true"]'); })
        : h('ul', { class: 'caderno-lista' }, vis.map(entrada)));
}

/* progresso e dados */
function resumo(ts, L) {
  let concl = 0, tent = 0, ac = 0;
  ts.forEach((t) => {
    const l = L[t.id] || {};
    if (l.status === 'concluida') concl++;
    (l.ex || []).forEach((v) => { if (v != null) { tent++; if (v === 2) ac++; } });
  });
  return { concl, tent, ac };
}
const acertos = (r) => (r.tent > 0 ? `Acertos: ${r.ac} de ${r.tent} exercícios` : 'Sem tentativas ainda');
function linhaComp(c, L) {
  const ts = D.filter((t) => t.competencia === c), r = resumo(ts, L);
  const hs = [...new Set(ts.flatMap((t) => t.habilidades))].filter((x) => { const n = Number(x.slice(1)); return n >= HAB_C[c][0] && n <= HAB_C[c][1]; })
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return h('li', { class: 'comp' },
    h('h2', {}, `${c} ${COMP[c]}`),
    h('p', {}, ts.length > 0 ? `${r.concl} de ${ts.length} ${ts.length === 1 ? 'tópico concluído' : 'tópicos concluídos'}` : 'Nenhum tópico disponível ainda.'),
    ts.length > 0 && h('progress', { max: ts.length, value: r.concl, 'aria-label': `Tópicos concluídos em ${c}` }),
    h('p', { class: 'muted' }, ts.length > 0 ? acertos(r) : 'Sem tentativas ainda'),
    hs.length > 0 && h('details', {}, h('summary', {}, 'Habilidades'),
      h('div', { class: 'det-body' }, h('ul', { class: 'hab' }, hs.map((x) => {
        const tx = ts.filter((t) => t.habilidades.includes(x)), rx = resumo(tx, L);
        return h('li', {}, `${x}: ${rx.concl} de ${tx.length} ${tx.length === 1 ? 'tópico' : 'tópicos'} · ${acertos(rx)}`);
      })))));
}
function baixarBackup() {
  const dados = {};
  CHAVES.forEach((k) => { const v = ld(k, null); if (v !== null) dados[k] = v; });
  const blob = new Blob([JSON.stringify({ app: 'enem-mat', versao: 1, data: hoje(), dados }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `enem-matematica-backup-${hoje()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup baixado');
}
function restaurar(inp) {
  const f = inp.files && inp.files[0];
  inp.value = '';
  if (!f) return;
  if (f.size > 2000000) { toast('Arquivo grande demais para ser um backup.'); return; }
  f.text().then((txt) => {
    let b;
    try { b = JSON.parse(txt); } catch { toast('Arquivo inválido: não é JSON.'); return; }
    const erro = validarBackup(b);
    if (erro) { toast(erro); return; }
    if (!confirm(`Restaurar substitui o progresso atual de ${M.nome} neste aparelho. Continuar?`)) return;
    CHAVES.forEach((k) => { if (k in b.dados) sv(k, b.dados[k]); else { delete mem[M.pre + k]; try { localStorage.removeItem('enem:' + M.pre + k); } catch { /* sem storage */ } } });
    T = null; J = null; toast('Backup restaurado'); mostrar();
  }, () => toast('Não foi possível ler o arquivo.'));
}
function apagarTudo() {
  if (!confirm(`Apagar todo o progresso de ${M.nome} deste aparelho? Redação não é afetada. Não dá para desfazer.`)) return;
  try {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('enem:' + M.pre)) ks.push(k); }
    ks.forEach((k) => localStorage.removeItem(k));
  } catch { /* sem storage */ }
  Object.keys(mem).forEach((k) => { if (k.startsWith(M.pre)) delete mem[k]; });
  S = null; ligaSessao(); T = null; J = null; filtroC = null; filtroCausa = null;
  toast(`Progresso de ${M.nome} apagado`); mostrar();
}
function reiniciarPlano() {
  if (!confirm('Reiniciar o plano hoje? O Dia 1 passa a ser hoje. Seus cartões, lições e níveis do jogo continuam.')) return;
  sv('inicio', hoje()); toast('Plano reiniciado: hoje é o Dia 1'); mostrar();
}
function telaProgresso() {
  const L = ld('licoes', {});
  const arq = h('input', { type: 'file', accept: 'application/json,.json', id: 'bk-file', onchange: () => restaurar(arq) });
  return h('div', {},
    h('ul', { class: 'comp-lista' }, Object.keys(COMP).map((c) => linhaComp(c, L))),
    h('details', {}, h('summary', {}, 'Dados e backup'),
      h('div', { class: 'det-body dados-box' },
        h('p', { class: 'muted' }, 'Dados ficam só neste aparelho.'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: baixarBackup }, 'Baixar backup')),
        h('div', { class: 'row' }, h('label', { for: 'bk-file' }, 'Restaurar backup'), arq),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: reiniciarPlano }, 'Reiniciar plano hoje')),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: apagarTudo }, `Apagar progresso de ${M.nome}`)))));
}

/* jogo: níveis em enem:mat:jogo; rodada em memória (J); a fase não vai no hash */
const NJ = [['Não iniciada', 'circle'], ['Tentada', 'circle-half'], ['Familiar', 'check'], ['Proficiente', 'checks'], ['Dominada', 'seal-check']];
const NQ = 5;
let J = null;
const nivelJogo = (n) => { const k = NJ[n] ? n : 0; return h('span', { class: 'jogo-nivel' }, icon(NJ[k][1]), NJ[k][0]); };
const ldJogo = () => { const o = ld('jogo', {}); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; };
const irMapa = () => { location.hash = H + 'jogo'; };
const semente = () => Date.now() % 2147483647;
const respTxt = (q, s) => s.vals.valor.toFixed(q.casas || 0).replace('.', ',') + (q.unidade ? (q.unidade === '%' || q.unidade === '°' ? '' : ' ') + q.unidade : '');
const sorteia = (t, i, seed) => ({ q: t.gerador.questoes[i], s: sortear(t.gerador, i, seed) });
const tenta = (f) => { try { f(); } catch { J = null; toast('Não foi possível gerar a questão.'); irMapa(); } };
const msgNivel = (a, b) => (b > a ? `Subiu para ${NJ[b][0]}.` : b < a ? `Desceu para ${NJ[b][0]}.` : `Continua ${NJ[b][0]}.`);
function novaRodada(t, fase) {
  J = { id: t.id, fase, pv: 1, novo: false, seed: semente(), np: 0, i: 0, res: [], e0: ldJogo()[t.id] ? normE(ldJogo()[t.id]) : null, pratica: false, dica: 0, resp: '' };
  J.cur = sorteia(t, 0, J.seed);
}
const passoLi = (p, novo) => h('li', { tabindex: '-1', 'data-novo': novo }, rich(p));
const Passos = (lista, vis, novo) => h('ol', { class: 'jogo-passos' }, lista.slice(0, vis).map((p, i) => passoLi(p, novo && i === vis - 1)));

function mapaJogo() {
  const jg = ldJogo(), dia = diaPlano(ld('inicio', null) || hoje());
  const jog = D.filter((t) => t.gerador);
  if (!jog.length) return vazio('Nenhum tópico para jogar ainda.', 'Abrir a trilha', irTrilha);
  const prox = proximoJogo(D, dia, jg) || jog.find((t) => normE(jg[t.id]).n < 4);
  const ordem = ['basico', 'intermediario', 'avancado'];
  const dias = [...new Set(D.map((t) => t.dia))].sort((a, b) => a - b);
  if (dias.includes(dia)) dias.unshift(...dias.splice(dias.indexOf(dia), 1));
  return h('div', {},
    h('div', { class: 'folha-topo' }, h('a', { class: 'voltar', href: H + 'trilha' }, 'Voltar à Trilha'),
      prox && h('a', { class: 'btn btn-primary', href: H + 'jogo/' + prox.id }, icon('play'), 'Continuar jogando: ', prox.titulo)),
    h('div', { class: 'dias' }, dias.map((d) => h('section', {},
      h('div', { class: 'dia-cab' }, h('h2', {}, `Dia ${d} · ${FOCO[d]}`)),
      d === dia && h('p', { class: 'dia-foco' }, 'Dia de hoje'),
      h('ul', { class: 'topicos' }, D.filter((t) => t.dia === d).sort((a, b) => ordem.indexOf(a.nivel) - ordem.indexOf(b.nivel)).map((t) => linha(t, {}, jg)))))));
}

function Resolucao(q, s, certo, pratica, dica) {
  const r = respTxt(q, s);
  return h('section', { class: 'jogo-res', 'aria-label': 'Resultado' },
    h('p', { class: 'rot ' + (certo ? 'ok-txt' : 'danger-txt') }, icon(certo ? 'check' : 'warning'),
      h('span', {}, certo ? `Certo: ${r}.` : [h('strong', {}, 'Errado.'), ` Não foi dessa vez. Resposta: ${r}.`])),
    pratica ? h('p', { class: 'muted' }, 'Prática: não vale ponto.') : certo && dica && h('p', { class: 'muted' }, 'Você usou Dica: esta questão não vale ponto.'),
    q.conceito && h('p', { class: 'conceito' }, h('strong', {}, 'Conceito: '), rich(q.conceito)),
    // só o número fica à vista; a resolução desta questão abre sob demanda
    h('details', { class: 'jogo-resolucao' }, h('summary', {}, 'Ver resolução desta questão'),
      Passos(q.passos.map((p) => preencher(p, s)), q.passos.length, false)));
}
function ResumoRodada(t) {
  const pts = J.res.filter((r) => r.ok === true).length, e = normE(ldJogo()[t.id]), rod = e.rod;
  const antes = (J.e0 || E0).n, dep = J.depois.n;
  return h('section', { class: 'jogo-res', 'aria-label': 'Resumo da rodada' },
    h('h2', {}, 'Resumo da rodada'),
    h('p', {}, `Pontos da rodada: ${pts} de ${NQ}`),
    h('p', {}, `Total do tópico: ${rod.reduce((a, r) => a + r.a, 0)} de ${NQ * rod.length} pontos em ${plural(rod.length, 'rodada', 'rodadas')}`),
    h('p', {}, 'Nível: ', nivelJogo(dep), ' ', msgNivel(antes, dep)),
    h('ol', { class: 'jogo-passos' }, J.res.map((r, i) => h('li', {}, `Questão ${i + 1}: ${r.ok === true ? 'Certo' : r.ok === null ? 'Certo, com Dica (sem ponto)' : 'Errado'}. Resposta: ${r.resp}.`))));
}

function conferir(t, x) {
  if (J.fase === 'feedback') return; // já respondida: não conta duas vezes
  const { q, s } = J.cur, certo = confere(x, s.vals.valor, q.casas || 0), ok = certo ? (J.dica > 0 ? null : true) : false;
  let msg = certo ? `Certo: ${respTxt(q, s)}.` : `Errado. Não foi dessa vez. Resposta: ${respTxt(q, s)}.`;
  J.certo = certo; J.fase = 'feedback';
  if (J.pratica) msg += ' Prática: não vale ponto.';
  else {
    const jg = ldJogo();
    jg[t.id] = responder(jg[t.id], ok); sv('jogo', jg);
    J.res.push({ ok, resp: respTxt(q, s) });
    if (J.res.length === NQ) {
      J.depois = fecharRodada(J.e0, J.res.map((r) => r.ok), hoje());
      jg[t.id] = J.depois; sv('jogo', jg);
      if (J.depois.n !== (J.e0 || E0).n) msg += ' ' + msgNivel((J.e0 || E0).n, J.depois.n);
    }
  }
  mostrarEm('#jogo-prox'); live(msg);
}
function proxima_(t) {
  if (J.res.length >= NQ) { J.fase = 'resumo'; mostrarEm('#jogo-outra'); live(`Resumo da rodada: ${J.res.filter((r) => r.ok === true).length} de ${NQ} pontos.`); return; }
  J.i = J.res.length; J.pratica = false; J.dica = 0; J.resp = ''; J.cur = sorteia(t, J.i, J.seed); J.fase = 'fazer';
  mostrarEm('#jogo-resp'); live(`Questão ${J.i + 1} de ${NQ}.`);
}
function outraPratica(t) {
  J.pratica = true; J.dica = 0; J.resp = ''; J.cur = sorteia(t, J.i, semente() + ++J.np); J.fase = 'fazer';
  mostrarEm('#jogo-resp'); live('Prática com números novos: não vale ponto.');
}
function CampoNumero(q, s, t) {
  const casas = q.casas || 0, valor = s.vals.valor;
  const dicas = q.passos.filter((p) => !p.includes('{valor}'));
  const dicaTxt = `Digite só o número final, sem a conta${q.unidade ? ` e sem a unidade (${q.unidade})` : ''}. ${casas === 0 ? 'É um número inteiro' : `Arredonde para ${plural(casas, 'casa decimal', 'casas decimais')}`}${Math.abs(valor) > 999 ? ', sem ponto de milhar' : ''}.`;
  const erro = h('p', { id: 'jogo-erro', class: 'danger-txt', role: 'alert' });
  const inp = h('input', { id: 'jogo-resp', type: 'text', inputmode: valor < 0 ? 'text' : 'decimal', autocomplete: 'off', 'aria-describedby': 'jogo-dica jogo-erro', oninput: () => { erro.textContent = ''; inp.removeAttribute('aria-invalid'); } });
  inp.value = J.resp || '';
  const dl = h('ol', { class: 'jogo-passos', 'aria-label': 'Dicas', hidden: J.dica === 0 }, dicas.slice(0, J.dica).map((p) => passoLi(preencher(p, s), false)));
  const rot = () => (J.dica >= dicas.length ? (J.dica ? 'Sem mais dicas' : 'Sem dica') : J.dica ? 'Outra dica' : J.pratica ? 'Dica' : 'Dica (-1 ponto)');
  const bd = h('button', { type: 'button', class: 'btn', 'aria-disabled': J.dica >= dicas.length ? 'true' : null, onclick: () => {
    if (J.dica >= dicas.length) return;
    J.resp = inp.value;
    const li = passoLi(preencher(dicas[J.dica], s), true);
    J.dica++; dl.hidden = false; dl.append(li); li.focus({ preventScroll: true });
    bd.replaceChildren(icon('lightbulb'), rot()); if (J.dica >= dicas.length) bd.setAttribute('aria-disabled', 'true');
    live(`Dica ${J.dica} aberta.${J.pratica ? '' : ' Esta questão não vale ponto.'}`);
  } }, icon('lightbulb'), rot());
  return h('form', { class: 'form-q', onsubmit: (e) => {
    e.preventDefault();
    const x = lerNumero(inp.value, q.unidade);
    if (x === null) { erro.textContent = 'Digite um número, por exemplo 12,5.'; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
    conferir(t, x);
  } },
  h('label', { for: 'jogo-resp' }, 'Sua resposta'), inp,
  h('p', { id: 'jogo-dica', class: 'muted' }, dicaTxt), erro, dl,
  h('div', { class: 'row' }, bd, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Conferir')));
}

function Rodada(t) {
  const ex = t.exemplos && t.exemplos[0], fase = J.fase, { q, s } = J.cur;
  const chave = `j:${t.id}:${J.i}:${J.seed}:${J.np}`;
  const barra = (...kids) => h('div', { class: 'treino-barra' }, h('a', { class: 'voltar', href: H + 'jogo' }, 'Voltar ao mapa'), ...kids);
  if (fase === 'aprender') {
    const n = ex.passos.length, ult = J.pv >= n, nv = J.novo;
    J.novo = false;
    const r = Rasc(chave);
    return h('div', { 'data-jogo': '' }, barra(h('p', { class: 'muted' }, `Aprender: exemplo resolvido, passo ${Math.min(J.pv, n)} de ${n}`)), par(r,
      h('div', { class: 'treino-card' }, h('p', { class: 'enun' }, rich(ex.enunciado)), ex.formula && formula(ex.formula, true), Passos(ex.passos, J.pv, nv)),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'jogo-av', onclick: () => {
        if (ult) { J.fase = 'fazer'; mostrarEm('#jogo-resp'); live(`Fazer: questão ${J.i + 1} de ${NQ}.`); return; }
        J.pv++; J.novo = true; mostrarEm('.jogo-passos [data-novo]');
      } }, ult ? 'Fazer uma questão' : 'Próximo passo'), r.btn)));
  }
  const pts = J.res.filter((r) => r.ok === true).length;
  if (fase === 'resumo') {
    return h('div', { 'data-jogo': '' }, barra(), ResumoRodada(t),
      h('div', { class: 'row' }, h('a', { class: 'btn btn-ghost', href: H + 'jogo' }, 'Voltar ao mapa'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'jogo-outra', onclick: () => tenta(() => { novaRodada(t, 'fazer'); mostrarEm('#jogo-resp'); live(`Nova rodada: questão 1 de ${NQ}.`); }) }, 'Jogar outra rodada')));
  }
  const rever = ex && fase !== 'feedback' && h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { J.fase = 'aprender'; J.pv = ex.passos.length; mostrar(true); live('Exemplo resolvido.'); } }, icon('lightbulb'), 'Rever exemplo');
  const topo = barra(rever, h('p', { class: 'muted' }, `Questão ${J.i + 1} de ${NQ} · ${J.pratica ? 'Prática: não vale ponto' : `Pontos: ${pts}`}`),
    h('progress', { max: NQ, value: J.res.length, 'aria-label': 'Progresso da rodada' }));
  const r = Rasc(chave);
  if (fase === 'feedback') {
    return h('div', { 'data-jogo': '' }, topo, par(r,
      h('div', { class: 'treino-card' }, h('p', { class: 'enun' }, rich(preencher(q.enunciado, s)))),
      Resolucao(q, s, J.certo, J.pratica, J.dica > 0),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => tenta(() => outraPratica(t)) }, 'Tentar outra'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'jogo-prox', onclick: () => tenta(() => proxima_(t)) }, J.res.length >= NQ ? 'Ver resumo' : 'Próxima questão'), r.btn)));
  }
  const col = par(r, h('div', { class: 'treino-card' }, h('p', { class: 'enun' }, rich(preencher(q.enunciado, s))), CampoNumero(q, s, t)), h('p', {}, r.btn));
  // tela pequena: o teclado e o sheet disputam espaço; ao focar a resposta o sheet recolhe (o desenho fica)
  col.addEventListener('focusin', (e) => { if (e.target.id === 'jogo-resp' && matchMedia('(max-width: 47.99em)').matches && !r.no.hidden) abreRasc(r.no, r.btn, false); });
  return h('div', { 'data-jogo': '' }, topo, col);
}

function telaJogo(arg) {
  if (!arg) { J = null; return mapaJogo(); }
  const t = topico(arg);
  if (!t) { J = null; $('#h-mat').textContent = 'Jogo'; return vazio('Tópico não encontrado.', 'Abrir o mapa do jogo', irMapa); }
  $('#h-mat').textContent = t.titulo;
  document.title = `${t.titulo} · Jogo · ENEM ${M.nome}`;
  if (!t.gerador) {
    J = null;
    return h('div', {}, h('a', { class: 'voltar', href: H + 'jogo' }, 'Voltar ao mapa'),
      h('div', { class: 'state' }, h('p', {}, 'Este tópico ainda não tem jogo.'), h('a', { class: 'btn', href: H + 'licao/' + t.id }, 'Ver a lição')));
  }
  try {
    if (!J || J.id !== t.id) novaRodada(t, (normE(ldJogo()[t.id]).n === 0 && t.exemplos && t.exemplos[0]) ? 'aprender' : 'fazer');
    return Rodada(t);
  } catch { J = null; return vazio('Não foi possível gerar a questão.', 'Voltar ao mapa', irMapa); }
}

/* roteador */
const partesRota = () => {
  const [, tela, arg] = location.hash.slice(1).split('/');
  return [TELAS[tela] ? tela : 'trilha', arg];
};
function mostrar(foco) {
  const el = $('[data-mat]');
  pronto(el);
  const [tela, arg] = partesRota();
  Q.inicio();
  const no = tela === 'jogo' ? telaJogo(arg) : tela === 'formulas' ? telaFormulas(arg) : tela === 'licao' ? telaLicao(arg) : tela === 'treino' ? telaTreino() : tela === 'trilha' ? telaTrilha()
    : tela === 'caderno' ? telaCaderno() : telaProgresso();
  el.replaceChildren(...[pill(), semStorage && h('p', { class: 'aviso' }, 'Seu progresso não pode ser salvo neste navegador.'), no].filter(Boolean));
  Q.fim();
  const chip = foco === 'chip' && $('.chips [aria-current]');
  if (chip) chip.focus({ preventScroll: true });
  else if (foco) { window.scrollTo(0, 0); $('#h-mat').focus({ preventScroll: true }); }
}
/* mostrar() e devolve o foco a um controle do DOM novo (o clicado foi destruído) */
function mostrarEm(sel) { mostrar(); const el = $(sel); if (el) el.focus({ preventScroll: true }); }
let tok = 0, ultima = null;
/* troca a matéria atual: estado de tela zerado, sessão e dados da matéria nova */
function usa(slug) {
  M = MATERIAS[slug]; H = '#' + M.slug + '/';
  FILES = M.files; FOCO = M.foco; COMP = M.comp; HAB_C = M.habc;
  D = DC[slug] || null;
  T = null; SIM = null; J = null; filtroC = null; filtroCausa = null; ultima = null; avisou5 = false;
  S = ld('sessao', null);
  if (S && !(S.fim > Date.now())) { S = null; sv('sessao', null); }
  ligaSessao();
}
function rotaMat(primeira, slug) {
  const s = MATERIAS[slug] ? slug : 'mat';
  if (s !== M.slug) usa(s);
  $('#mat').hidden = false;
  const [tela] = partesRota();
  $$('.nav-mat a').forEach((a) => {
    a.setAttribute('href', H + a.dataset.matRoute);
    if (a.dataset.matRoute === (tela === 'licao' || tela === 'formulas' || tela === 'jogo' ? 'trilha' : tela)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (tela !== 'treino') { T = null; SIM = null; }
  if (tela !== 'jogo') J = null;
  $('#h-mat').textContent = TELAS[tela];
  document.title = `${TELAS[tela]} · ENEM ${M.nome}`;
  const meu = ++tok, el = $('[data-mat]');
  const chip = tela === 'formulas' && ultima === 'formulas';
  ultima = tela;
  if (D) { mostrar(!primeira && (chip ? 'chip' : true)); return; }
  skeleton(el);
  carregar().then(() => { if (meu === tok) mostrar(!primeira); }, () => { if (meu === tok) erroEstado(el, () => rotaMat(true)); });
}
Object.assign(window.ENEM, { rotaMat, materias: MATERIAS, hoje, addDias, difDias });
})();
