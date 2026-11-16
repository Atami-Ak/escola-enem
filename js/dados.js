/* Repositório único de dados da Escola (localStorage, prefixo `enem:`). Sem DOM: carrega no node para teste.
   Costura para banco futuro: trocar o adaptador por outro com get/set assíncronos (Promise); validar aqui é UX,
   quem vale é o servidor. Validadores montam objetos NOVOS só com campos conhecidos (imune a __proto__) e
   truncam texto longo em vez de descartar. */
const PREFIXO = 'enem:';
const MAX_TEXTO = 256 * 1024;

const adaptador = {
  get(k) { try { return localStorage.getItem(PREFIXO + k); } catch { return null; } },
  set(k, t) { try { localStorage.setItem(PREFIXO + k, t); return true; } catch { return false; } },
  remove(k) { try { localStorage.removeItem(PREFIXO + k); return true; } catch { return false; } },
  keys() {
    try { const r = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIXO)) r.push(k.slice(PREFIXO.length)); } return r; } catch { return []; }
  },
};

const ehObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const CHAVE_PROIBIDA = new Set(['__proto__', 'constructor', 'prototype']);
function dataIso(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const mapaSimples = (v) => {
  if (!ehObj(v)) return null;
  const ks = Object.keys(v);
  if (ks.length > 2000) return null;
  const o = {};
  for (const k of ks) if (!CHAVE_PROIBIDA.has(k)) o[k] = v[k];
  return o;
};

const VALIDA = {
  'escola:aluno'(v) {
    if (!ehObj(v)) return null;
    const visitas = Array.isArray(v.visitas) ? [...new Set(v.visitas.filter(dataIso))].slice(-400) : [];
    const o = { nome: typeof v.nome === 'string' ? v.nome.trim().slice(0, 24) : '', visitas };
    if (Number.isFinite(v.xpVisto) && v.xpVisto >= 0) o.xpVisto = v.xpVisto;
    return o;
  },
  'escola:agenda'(v) {
    if (!Array.isArray(v)) return null;
    const out = [];
    for (const x of v.slice(0, 500)) {
      if (!ehObj(x) || typeof x.id !== 'string' || typeof x.titulo !== 'string' || !x.id || !x.titulo || !dataIso(x.data)) continue;
      out.push({ id: x.id.slice(0, 40), titulo: x.titulo.slice(0, 60), tipo: txt(x.tipo, 20), materia: txt(x.materia, 40), data: x.data, feito: x.feito === true });
    }
    return out;
  },
  'escola:livros'(v) {
    if (!ehObj(v)) return null;
    const o = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 300) break;
      if (CHAVE_PROIBIDA.has(k) || (v[k] !== 'quero' && v[k] !== 'lido')) continue;
      o[k.slice(0, 60)] = v[k]; n++;
    }
    return o;
  },
  'escola:caps'(v) {
    if (!ehObj(v)) return null;
    const o = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 300) break;
      if (CHAVE_PROIBIDA.has(k) || !Array.isArray(v[k]) || v[k].length !== 3) continue;
      o[k.slice(0, 60)] = v[k].map((x) => (x === 1 ? 1 : 0)); n++;
    }
    return o;
  },
  'escola:auto'(v) {
    if (!ehObj(v)) return null;
    const o = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 300) break;
      if (CHAVE_PROIBIDA.has(k) || v[k] !== true) continue;
      o[k.slice(0, 60)] = true; n++;
    }
    return o;
  },
  'escola:plano'(v) {
    if (!ehObj(v)) return null;
    const o = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 20) break;
      if (CHAVE_PROIBIDA.has(k) || !Array.isArray(v[k])) continue;
      o[k.slice(0, 40)] = v[k].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6); n++;
    }
    return o;
  },
  'escola:estudo'(v) { // minutos de foco por dia: { 'AAAA-MM-DD': 0..1440 }, só as 400 datas mais recentes
    if (!ehObj(v)) return null;
    const ks = Object.keys(v).filter((k) => dataIso(k) && Number.isInteger(v[k]) && v[k] >= 0 && v[k] <= 1440).sort().slice(-400);
    const o = {};
    for (const k of ks) o[k] = v[k];
    return o;
  },
  'escola:duracao'(v) { // minutos por sessão de cada matéria: { slug: 25|45|60|90 }
    if (!ehObj(v)) return null;
    const o = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 20) break;
      if (CHAVE_PROIBIDA.has(k) || k.length > 40 || ![25, 45, 60, 90].includes(v[k])) continue;
      o[k] = v[k]; n++;
    }
    return o;
  },
  'escola:aviso'(v) { return dataIso(v) ? v : null; }, // string: dia em que o aviso foi dispensado
  'escola:teste'(v) {
    if (!ehObj(v)) return null;
    const o = {};
    for (const k of ['antes', 'depois']) {
      const t = v[k];
      if (ehObj(t) && Number.isInteger(t.nota) && t.nota >= 0 && t.nota <= 5 && dataIso(t.data)) o[k] = { nota: t.nota, data: t.data };
    }
    return o;
  },
  'escola:ultimo'(v) {
    if (!ehObj(v) || typeof v.slug !== 'string' || !/^[a-z]{1,20}$/.test(v.slug) || typeof v.id !== 'string') return null;
    return { slug: v.slug, id: v.id.slice(0, 80) };
  },
};

const registro = (k) => VALIDA[k] || (/:(jogo|licoes)$/.test(k) ? mapaSimples : (v) => v);

const repo = {
  get(k, valida = registro(k), fallback = null) {
    const t = adaptador.get(k);
    if (t === null || t === undefined || typeof t !== 'string' || t.length > MAX_TEXTO) return fallback;
    let v;
    try { v = JSON.parse(t); } catch { return fallback; }
    try { const r = valida(v); return r == null ? fallback : r; } catch { return fallback; }
  },
  set(k, v) {
    let t;
    try { t = JSON.stringify(v); } catch { return false; }
    return typeof t === 'string' && adaptador.set(k, t);
  },
  list(prefixo = '') { return adaptador.keys().filter((k) => k.startsWith(prefixo)); },
  remove(k) { return adaptador.remove(k); },
  clear(prefixo = '') { let ok = true; for (const k of repo.list(prefixo)) ok = adaptador.remove(k) && ok; return ok; },
};

if (typeof module !== 'undefined') module.exports = { repo, VALIDA };
