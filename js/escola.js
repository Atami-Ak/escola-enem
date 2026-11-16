/* Escola: início, matérias, agenda e biblioteca. Todo texto entra por nós DOM (h/createTextNode), nunca por HTML de dado.
   Lê o registro window.ENEM.materias (mat.js); não altera Redação nem o motor de Matemática. */
(() => {
'use strict';
const E = typeof window !== 'undefined' ? window.ENEM : null;

/* ---------- planejador: funções puras (sem DOM; testadas em tools/escola_test.js) ---------- */
// A CONFIRMAR no site do INEP: data provisória (domingo), ENEM 2027 ainda sem edital.
const DATA_ENEM = '2027-11-07';
const diasAte = (data, hj) => (E ? E.difDias : require('./mat.js').difDias)(hj, data);
const textoContagem = (n) => (n > 1 ? `Faltam ${n} dias para o ENEM 2027` : n === 1 ? 'Falta 1 dia para o ENEM 2027' : n === 0 ? 'O ENEM é hoje' : 'A data prevista já passou, confira no site do INEP');
const diaSemana = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getDay(); }; // 0 = Dom; nunca new Date(iso) (UTC)
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const DIA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIA_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
function normPlano(raw, slugs) {
  const o = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return o;
  for (const s of Object.keys(raw)) {
    if (!slugs.includes(s) || !Array.isArray(raw[s])) continue;
    o[s] = [...new Set(raw[s].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => ORDEM.indexOf(a) - ORDEM.indexOf(b));
  }
  return o;
}
const materiasDoDia = (plano, dow) => Object.keys(plano).filter((s) => plano[s].includes(dow));
const linkYoutube = (materia, topico) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent((topico ? topico + ' ' : '') + materia + ' ENEM aula');
/** Livros com texto em data/livros.json; os demais da estante ficam "Em breve". */
const COM_TEXTO = ['l1', 'l2', 'l3', 'l4'];
/** Alterna o capítulo i do livro id. Devolve estado NOVO (entrada intacta) e ev: 'concluido' | 'voltou' | null. */
function marcaCap({ livros, caps, auto }, id, i) {
  const c = [...(caps[id] || [0, 0, 0])];
  c[i] = c[i] === 1 ? 0 : 1;
  const r = { livros: { ...livros }, caps: { ...caps, [id]: c }, auto: { ...auto } };
  let ev = null;
  if (c.every((x) => x === 1) && r.livros[id] !== 'lido') { r.livros[id] = 'lido'; r.auto[id] = true; ev = 'concluido'; }
  else if (c[i] === 0 && r.auto[id]) { r.livros[id] = 'quero'; delete r.auto[id]; ev = 'voltou'; }
  return { ...r, ev };
}
/* sessão de estudo: tempo sempre por parâmetro (`agora` em ms), nunca lido aqui */
const addD = (d, n) => (E ? E.addDias : require('./mat.js').addDias)(d, n);
const TECNICAS = { p25: { foco: 25, pausa: 5, nome: 'Pomodoro 25/5' }, p50: { foco: 50, pausa: 10, nome: '50/10' }, bloco: { foco: 0, pausa: 0, nome: 'Bloco único' } };
const DUR_PADRAO = 45;
/** {foco, pausa, ciclos} em minutos: Pomodoro repete foco+pausa; Bloco único é 1 foco de `min`. */
function fasesDe(tec, min) {
  const t = TECNICAS[tec];
  if (!t || !t.foco) return { foco: min, pausa: 0, ciclos: 1 };
  return { foco: t.foco, pausa: t.pausa, ciclos: Math.max(1, Math.round(min / t.foco)) };
}
/** foco, pausa, foco, ... foco (sem pausa depois do último foco), em ms. */
function listaFases(f) {
  const r = [];
  for (let c = 1; c <= f.ciclos; c++) {
    r.push({ tipo: 'foco', ms: f.foco * 60000, ciclo: c });
    if (f.pausa && c < f.ciclos) r.push({ tipo: 'pausa', ms: f.pausa * 60000, ciclo: c });
  }
  return r;
}
/** s = {fases, acumMs, desde|null}. Avança quantas fases forem precisas (aba dormindo). */
function estadoEm(s, agora) {
  let rest = Math.max(0, s.acumMs + (s.desde == null ? 0 : agora - s.desde)), foco = 0;
  const ciclos = s.fases.filter((x) => x.tipo === 'foco').length;
  for (let i = 0; i < s.fases.length; i++) {
    const f = s.fases[i];
    if (rest < f.ms) return { fase: i, tipo: f.tipo, restanteMs: f.ms - rest, ciclo: f.ciclo, ciclos, fim: false, focoMs: foco + (f.tipo === 'foco' ? rest : 0) };
    rest -= f.ms;
    if (f.tipo === 'foco') foco += f.ms;
  }
  const u = s.fases[s.fases.length - 1];
  return { fase: s.fases.length - 1, tipo: u.tipo, restanteMs: 0, ciclo: u.ciclo, ciclos, fim: true, focoMs: foco };
}
/** XP dos minutos de foco: floor(soma de min(180, minutos do dia) / 3). */
const xpEstudo = (estudo) => Math.floor(Object.values(estudo || {}).reduce((t, v) => t + (Number.isFinite(v) && v > 0 ? Math.min(180, v) : 0), 0) / 3);
const duracaoDe = (dur, slug) => (dur && [25, 45, 60, 90].includes(dur[slug]) ? dur[slug] : DUR_PADRAO);
/** Aviso do dia: há matéria hoje, 0 min estudados hoje e o aviso não foi dispensado hoje. */
function deveAvisar(plano, estudo, aviso, hj) {
  return materiasDoDia(plano || {}, diaSemana(hj)).length > 0 && !((estudo || {})[hj] > 0) && aviso !== hj;
}
/** 7 datas Seg..Dom que contêm hj. */
function semanaDe(hj) {
  const ini = addD(hj, -ORDEM.indexOf(diaSemana(hj)));
  return Array.from({ length: 7 }, (_, i) => addD(ini, i));
}
/** planejado = soma de dias x duração de cada matéria; feito = minutos da semana (sem teto). */
function resumoSemana(plano, dur, estudo, hj) {
  const planejado = Object.keys(plano || {}).reduce((t, s) => t + plano[s].length * duracaoDe(dur, s), 0);
  const feito = semanaDe(hj).reduce((t, d) => t + ((estudo || {})[d] > 0 ? estudo[d] : 0), 0);
  return { feito, planejado };
}
if (typeof module !== 'undefined') module.exports = { DATA_ENEM, diasAte, textoContagem, diaSemana, normPlano, materiasDoDia, linkYoutube, COM_TEXTO, marcaCap, TECNICAS, fasesDe, listaFases, estadoEm, xpEstudo, duracaoDe, deveAvisar, semanaDe, resumoSemana };
if (!E) return;
const { h, $, $$, store, icon, skeleton, erroEstado, pronto, vazio } = E;

/* ---------- datas (reuso de mat.js; cópia mínima só se o registro não estiver exposto) ---------- */
const { hoje, addDias, difDias } = E; // expostos por mat.js
const ddmm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- registro e storage ---------- */
const MAT = () => Object.values(E.materias || {});
const pre = (m) => m.pre || `${m.slug}:`;
const NOME = { redacao: 'Redação' };
const nomeMateria = (slug) => NOME[slug] || (E.materias && E.materias[slug] ? E.materias[slug].nome : '');
const ic = (n) => (n && document.getElementById('i-' + n) ? icon(n) : null);
const live = (m) => { $('#live').textContent = m; };
let storageOk = true;
try { localStorage.setItem('enem:_t', '1'); localStorage.removeItem('enem:_t'); } catch { storageOk = false; }
const mem = {}; // espelho: sem storage o app funciona só na sessão
const ld = (k, d) => { if (!(k in mem)) mem[k] = repo.get(k); return mem[k] == null ? d : mem[k]; };
const sv = (k, v) => { mem[k] = v; repo.set(k, v); };
const lista = (k) => { const v = ld(k, []); return Array.isArray(v) ? v : []; };
const objeto = (k) => { const v = ld(k, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const mostra = (el, ...k) => el.replaceChildren(...k.flat().filter((x) => x != null && x !== false));
const avisoStorage = () => (storageOk ? null : h('p', { class: 'aviso' }, 'Seu progresso não pode ser salvo neste navegador.'));

/* ---------- regra única de XP, nível e sequência ---------- */
const XP_NIVEL = 200;
const nivelDe = (xp) => Math.floor(xp / XP_NIVEL) + 1;
function sequencia(visitas) {
  const s = new Set(visitas), h0 = hoje();
  let d = s.has(h0) ? h0 : s.has(addDias(h0, -1)) ? addDias(h0, -1) : null, n = 0;
  while (d && s.has(d)) { n++; d = addDias(d, -1); }
  return n;
}
/** xp = 10 x pontos do jogo (soma rod[].a) + 30 x lições concluídas + 20 x itens da agenda concluídos + floor(minutos de foco / 3, teto 180 por dia); tudo derivado do storage. */
// sem storage: valores ficam em 0 (ENEM.ld do mat.js não é exposto)
function progressoAluno() {
  const a = objeto('escola:aluno');
  let pts = 0, licoes = 0;
  for (const m of MAT()) {
    const j = repo.get(pre(m) + 'jogo');
    if (j && typeof j === 'object') for (const e of Object.values(j)) if (e && Array.isArray(e.rod)) for (const r of e.rod) if (r && Number.isFinite(r.a) && r.a > 0) pts += r.a;
    const L = repo.get(pre(m) + 'licoes');
    if (L && typeof L === 'object') for (const l of Object.values(L)) if (l && l.status === 'concluida') licoes++;
  }
  const feitos = agenda().filter((x) => x.feito).length;
  const xp = 10 * pts + 30 * licoes + 20 * feitos + xpEstudo(objeto('escola:estudo'));
  return { nome: a.nome || '', xp, nivel: nivelDe(xp), resto: xp % XP_NIVEL, seq: sequencia(Array.isArray(a.visitas) ? a.visitas : []) };
}
function registrarVisita() {
  const a = objeto('escola:aluno');
  if (!a.nome) return;
  const v = Array.isArray(a.visitas) ? a.visitas : [];
  if (!v.includes(hoje())) sv('escola:aluno', { ...a, visitas: [...v, hoje()].slice(-400) });
}
/** Posição inicial da barra (para animar) e aviso de subida de nível; grava o XP visto. */
function xpInicial(p) {
  const a = objeto('escola:aluno'), visto = Number.isFinite(a.xpVisto) ? a.xpVisto : p.xp;
  if (p.nome && visto !== p.xp) sv('escola:aluno', { ...a, xpVisto: p.xp });
  if (nivelDe(visto) < p.nivel) { live(`Subiu para o nível ${p.nivel}.`); return 0; }
  return nivelDe(visto) === p.nivel ? visto % XP_NIVEL : p.resto;
}

/* ---------- componentes ---------- */
const TITULOS = { inicio: 'Início', materias: 'Matérias', agenda: 'Agenda', biblioteca: 'Biblioteca', teste: 'Teste antes e depois' };
function NavPrincipal(sec) {
  if (sec === 'livro') sec = 'biblioteca';
  $$('.area a').forEach((a) => { if (a.dataset.nav === sec) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
const SVG_NS = 'http://www.w3.org/2000/svg';
const pctDe = (x, t) => (t > 0 ? Math.max(0, Math.min(100, (x / t) * 100)) : 0);
/** Anel de progresso: pathLength=100, dashoffset por atributo (CSP); a transição CSS só existe sem prefers-reduced-motion. */
function Anel({ pct, ini, tam, filho }) {
  const c = (cls, r) => { const n = document.createElementNS(SVG_NS, 'circle'); n.setAttribute('class', cls); n.setAttribute('cx', '18'); n.setAttribute('cy', '18'); n.setAttribute('r', r); n.setAttribute('pathLength', '100'); return n; };
  const trilho = c('anel-t', '15'), fill = c('anel-f', '15');
  fill.setAttribute('stroke-dasharray', '100');
  fill.setAttribute('stroke-dashoffset', String(100 - (ini == null ? pct : ini)));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36'); svg.setAttribute('class', 'anel'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.append(trilho, fill);
  if (ini != null && ini !== pct) requestAnimationFrame(() => requestAnimationFrame(() => fill.setAttribute('stroke-dashoffset', String(100 - pct))));
  return h('span', { class: `anel-w anel-${tam}`, 'aria-hidden': 'true' }, svg, filho);
}
let seqVista = null; // só na sessão: o pop da chama toca uma vez quando a sequência sobe
function Chama({ seq }) {
  const sobe = seqVista != null && seq > seqVista;
  seqVista = seq;
  return h('span', { class: `chama${seq ? '' : ' chama-off'}${sobe ? ' chama-pop' : ''}` },
    ic('flame'),
    seq ? [h('strong', { class: 'chama-n' }, String(seq)), h('span', { class: 'chama-u' }, seq === 1 ? 'dia' : 'dias')] : h('span', { class: 'chama-u' }, 'Comece hoje'),
    sobe && h('span', { class: 'chama-spark', 'aria-hidden': 'true' }, ic('sparkle')));
}
const IconeMateria = ({ slug, icone }) => h('span', { class: `ic-bloco mt-${slug}`, 'aria-hidden': 'true' }, ic(icone));
function ResumoAluno(p, compacto) {
  const txt = `Nível ${p.nivel} · ${p.resto} de ${XP_NIVEL} XP`;
  if (compacto) return h('span', { class: 'tag tag-nv' }, ic('star'), txt);
  return h('div', { class: 'hero' },
    Chama({ seq: p.seq }),
    Anel({ pct: pctDe(p.resto, XP_NIVEL), ini: pctDe(p.ini, XP_NIVEL), tam: 'hero', filho: h('span', { class: 'hero-nv' }, ic('star'), String(p.nivel)) }),
    h('p', { class: 'hero-t' }, txt),
    h('a', { class: 'btn btn-primary btn-grande hero-jogar', href: '#mat/jogo' }, ic('play'), 'Jogar'));
}
/** Cartão de matéria: ícone-bloco colorido, nome, "x de y" e anel (pequeno) ou barra (largo). prog = {feitos,total} ou null. */
function CartaoMateria({ href, slug, nome, icone, meta, prog, rotulo, largo }) {
  const pct = prog ? pctDe(prog.feitos, prog.total) : 0;
  const bar = largo && prog ? h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { class: 'bar-f' })) : null;
  if (bar) { bar.firstChild.style.setProperty('--p', '0'); requestAnimationFrame(() => requestAnimationFrame(() => bar.firstChild.style.setProperty('--p', String(pct)))); }
  const anel = !largo && prog ? Anel({ pct, ini: 0, tam: 'card' }) : null;
  const txt = prog ? `${prog.feitos} de ${prog.total}` : meta;
  return h('a', { class: `${largo ? 'hub-card' : 'hub-item'} mt-${slug}`, href, 'aria-label': rotulo },
    IconeMateria({ slug, icone }),
    h('span', { class: 'hub-c' }, h('span', { class: 'hub-t' }, nome), h('span', { class: 'meta' }, txt), bar),
    anel || (largo ? ic('caret-right') : null));
}

/* ---------- Início ---------- */
function formNome(a, p) {
  const inp = h('input', { type: 'text', id: 'f-nome', name: 'nome', maxlength: 24, autocomplete: 'given-name', 'aria-describedby': 'f-nome-dica f-nome-erro' });
  const erro = h('p', { id: 'f-nome-erro', class: 'danger-txt', role: 'alert', hidden: true });
  inp.addEventListener('input', () => { erro.hidden = true; inp.removeAttribute('aria-invalid'); });
  return h('form', {
    class: 'form-nome', novalidate: true,
    onsubmit: (ev) => {
      ev.preventDefault();
      const v = inp.value.trim().replace(/\s+/g, ' ');
      if (!v) { erro.textContent = 'Digite seu nome para começar.'; erro.hidden = false; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
      sv('escola:aluno', { ...a, nome: v, visitas: Array.isArray(a.visitas) ? a.visitas : [], xpVisto: p.xp });
      location.hash = '#materias';
    },
  },
  h('label', { for: 'f-nome' }, 'Seu nome'), inp,
  h('p', { id: 'f-nome-dica', class: 'meta' }, 'Até 24 letras'),
  erro,
  h('button', { type: 'submit', class: 'btn btn-primary btn-grande' }, 'Começar'));
}
function proximoEvento() {
  const h0 = hoje();
  return agenda().filter((x) => !x.feito && x.data >= h0).sort((x, y) => x.data.localeCompare(y.data))[0] || null;
}
function viewInicio(el) {
  const a = objeto('escola:aluno'), p = progressoAluno(), t = $('#h-inicio');
  if (!p.nome) {
    t.textContent = 'Bem-vindo';
    mostra(el, avisoStorage(), formNome(a, p));
    pronto(el);
    return;
  }
  t.textContent = `Olá, ${p.nome}`;
  p.ini = xpInicial(p);
  const prox = proximoEvento();
  mostra(el,
    avisoStorage(),
    avisoNode((slug) => { abrePre(slug); location.hash = '#agenda'; }, () => { sv('escola:aviso', hoje()); viewInicio(el); $('#h-inicio').focus({ preventScroll: true }); }),
    h('div', { class: 'inicio-grade' },
      ResumoAluno(p),
      h('div', { class: 'inicio-lado' },
        prox && h('p', { class: 'prox' }, ic('calendar-blank'), h('span', {}, `Próximo: ${prox.titulo}, ${ddmm(prox.data)}`)),
        h('a', { class: 'btn btn-ghost', href: '#teste' }, 'Teste antes e depois'),
        h('button', {
          type: 'button', class: 'btn btn-ghost',
          onclick: () => { sv('escola:aluno', { ...objeto('escola:aluno'), nome: '' }); viewInicio(el); $('#h-inicio').focus({ preventScroll: true }); },
        }, 'Alterar nome'))));
  pronto(el);
}

/* ---------- Matérias ---------- */
const topicosCache = {};
/** Lista [{id, titulo}] dos tópicos da matéria, ou null se os dados não carregam. */
function topicosDe(m) {
  if (!topicosCache[m.slug]) {
    topicosCache[m.slug] = Promise.all(m.files.map(async (f) => {
      const r = await fetch(`data/${m.dir}/${String(f).replace(/\.json$/, '')}.json`);
      if (!r.ok) throw new Error(String(r.status));
      const l = await r.json();
      return Array.isArray(l) ? l.map((t) => ({ id: t.id, titulo: t.titulo })) : [];
    })).then((x) => x.flat()).catch(() => { delete topicosCache[m.slug]; return null; });
  }
  return topicosCache[m.slug];
}
const feitosDe = (m, tops) => {
  const L = repo.get(pre(m) + 'licoes');
  return L && typeof L === 'object' ? tops.filter((t) => L[t.id] && L[t.id].status === 'concluida').length : 0;
};
let tokM = 0;
function viewMaterias(el) {
  const mats = MAT(), meu = ++tokM;
  if (!mats.length) { erroEstado(el, () => viewMaterias(el)); return; }
  skeleton(el);
  Promise.all(mats.map(topicosDe)).then((tops) => {
    if (meu !== tokM) return;
    if (tops.every((x) => x === null)) { erroEstado(el, () => viewMaterias(el)); return; }
    const p = progressoAluno(), por = {};
    mats.forEach((m, i) => { por[m.slug] = tops[i]; });
    const resumo = (m) => {
      const t = por[m.slug];
      return t ? { feitos: feitosDe(m, t), total: t.length } : null;
    };
    const ult = objeto('escola:ultimo'), um = E.materias[ult.slug], ut = um && por[um.slug] ? por[um.slug].find((t) => t.id === ult.id) : null;
    const mat = E.materias.mat, rm = mat && resumo(mat);
    p.ini = xpInicial(p);
    mostra(el, 
      avisoStorage(),
      (p.nome || ut) && h('div', { class: 'hub-topo' },
        ut && h('a', { class: 'btn btn-primary', href: `#${ult.slug}/licao/${ult.id}` }, `Continuar: ${ut.titulo}`),
        p.nome && ResumoAluno(p, true)),
      h('div', { class: 'hub-largos' },
        CartaoMateria({ largo: true, slug: 'redacao', icone: 'pencil-simple', href: '#repertorio', nome: 'Redação', meta: 'Repertório, temas, aulas' }),
        mat && CartaoMateria({ largo: true, slug: mat.slug, icone: mat.icone, href: '#mat/trilha', nome: mat.nome, prog: rm, meta: 'Trilha, treino, jogo', rotulo: rm ? `${mat.nome}, ${rm.feitos} de ${rm.total} tópicos feitos` : null })),
      h('h2', { class: 'hub-sub' }, 'Outras matérias'),
      h('div', { class: 'hub-lista' }, mats.filter((m) => m.slug !== 'mat').map((m) => {
        const r = resumo(m);
        return CartaoMateria({ slug: m.slug, href: `#${m.slug}/trilha`, nome: m.nome, icone: m.icone, prog: r, meta: 'Indisponível', rotulo: r ? `${m.nome}, ${r.total} ${r.total === 1 ? 'tópico' : 'tópicos'}, ${r.feitos} de ${r.total} feitos` : `${m.nome}, conteúdo indisponível no momento` });
      })));
    pronto(el);
  });
}
/** Guarda o último tópico aberto para o botão "Continuar". */
function registrarUltimo() {
  const mm = /^#([a-z0-9-]+)\/licao\/([^/]+)/.exec(location.hash);
  if (mm && E.materias && E.materias[mm[1]]) sv('escola:ultimo', { slug: mm[1], id: mm[2] });
}

/* ---------- Agenda ---------- */
const TIPOS = [['prova', 'Prova', 'Provas'], ['trabalho', 'Trabalho', 'Trabalhos'], ['evento', 'Evento', 'Eventos']];
const GRUPOS = ['Atrasados', 'Hoje', 'Esta semana', 'Depois', 'Concluídos'];
const agenda = () => lista('escola:agenda').filter((x) => x && typeof x.id === 'string' && typeof x.titulo === 'string' && typeof x.data === 'string' && DATA_OK.test(x.data));
let fAg = 'todos';
const ativa = (r) => { const s = $('#' + r); return s && !s.hidden; };
const grupoDe = (x) => {
  if (x.feito) return 'Concluídos';
  const d = difDias(hoje(), x.data);
  return d < 0 ? 'Atrasados' : d === 0 ? 'Hoje' : d <= 7 ? 'Esta semana' : 'Depois';
};
function prazo(x) {
  if (x.feito) return h('span', { class: 'tag tag-ok' }, ic('check'), 'Concluído');
  const d = difDias(hoje(), x.data);
  if (d < 0) return h('span', { class: 'tag tag-danger' }, ic('warning'), 'Atrasado');
  if (d <= 3) return h('span', { class: 'tag tag-warn' }, ic('calendar-blank'), d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : `Em ${d} dias`);
  return null;
}
function toastDesfazer(msg, fn) {
  const t0 = $('#toast'), t = t0.cloneNode(false); // nó novo: o timer de 2 s do toast do app.js fica preso ao nó antigo
  t0.replaceWith(t);
  clearTimeout(toastDesfazer.t);
  t.replaceChildren(`${msg} `, h('button', { type: 'button', class: 'toast-btn', onclick: () => { t.hidden = true; clearTimeout(toastDesfazer.t); fn(); } }, 'Desfazer'));
  t.hidden = false;
  toastDesfazer.t = setTimeout(() => { t.hidden = true; }, 8000);
}
function FormAgenda(onAdd) {
  const mq = matchMedia('(min-width: 64em)');
  const tit = h('input', { type: 'text', id: 'a-tit', maxlength: 60, autocomplete: 'off', 'aria-describedby': 'a-erro' });
  const tipo = h('select', { id: 'a-tipo' }, TIPOS.map(([v, s]) => h('option', { value: v }, s)));
  const mat = h('select', { id: 'a-mat' }, h('option', { value: '' }, 'Nenhuma'), h('option', { value: 'redacao' }, 'Redação'), MAT().map((m) => h('option', { value: m.slug }, m.nome)));
  const dia = h('input', { type: 'date', id: 'a-data', 'aria-describedby': 'a-erro' });
  const erro = h('p', { id: 'a-erro', class: 'danger-txt', role: 'alert', hidden: true });
  const campo = (rot, id, ctl) => h('div', { class: 'campo' }, h('label', { for: id }, rot), ctl);
  const det = h('details', { class: 'agenda-form' },
    h('summary', {}, ic('plus'), 'Adicionar'),
    h('form', {
      class: 'det-body', novalidate: true,
      oninput: () => { erro.hidden = true; tit.removeAttribute('aria-invalid'); dia.removeAttribute('aria-invalid'); },
      onsubmit: (ev) => {
        ev.preventDefault();
        const t = tit.value.trim().replace(/\s+/g, ' ');
        const falha = !t ? ['Digite um título.', tit] : !DATA_OK.test(dia.value) ? ['Escolha uma data.', dia] : null;
        if (falha) { erro.textContent = falha[0]; erro.hidden = false; falha[1].setAttribute('aria-invalid', 'true'); falha[1].focus(); return; }
        onAdd({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), titulo: t, tipo: tipo.value, materia: mat.value, data: dia.value, feito: false });
        ev.target.reset(); // o form agora persiste entre renders
        det.open = mq.matches;
      },
    },
    campo('Título', 'a-tit', tit), campo('Tipo', 'a-tipo', tipo), campo('Matéria', 'a-mat', mat), campo('Data', 'a-data', dia),
    erro, h('button', { type: 'submit', class: 'btn' }, 'Salvar')));
  det.open = mq.matches;
  det.addEventListener('toggle', () => { if (!det.open && mq.matches) det.open = true; }); // desktop: sempre aberto
  return det;
}
function ItemAgenda(x, acoes) {
  const meta = [(TIPOS.find((t) => t[0] === x.tipo) || [])[1], nomeMateria(x.materia), ddmm(x.data)].filter(Boolean).join(' · ');
  return h('li', { class: 'item-ag', 'data-ag': x.id },
    h('label', { class: 'ag-check' },
      h('input', { type: 'checkbox', checked: x.feito, onchange: () => acoes.concluir(x.id) }),
      h('span', { class: x.feito ? 'ag-t ag-feito' : 'ag-t' }, x.titulo)),
    h('div', { class: 'ag-m' }, h('span', { class: 'meta' }, meta), prazo(x)),
    h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': `Remover ${x.titulo}`, onclick: () => acoes.remover(x.id) }, ic('trash'), 'Remover'));
}
/* ---------- planejador: componentes ---------- */
// ponytail: tópicos de Redação fixos aqui (não há arquivo de dados); trocar por data/ quando existir.
const TOP_REDACAO = ['Estrutura da dissertação-argumentativa', 'As 5 competências da correção', 'Tese e argumentos', 'Conectivos e coesão', 'Proposta de intervenção', 'Repertório sociocultural'].map((t, i) => ({ id: 'r' + i, titulo: t }));
const planoMats = () => [{ slug: 'redacao', nome: 'Redação' }, ...MAT().map((m) => ({ slug: m.slug, nome: m.nome }))];
const lerPlano = () => normPlano(objeto('escola:plano'), planoMats().map((m) => m.slug));
const matsDoPlano = (plano) => planoMats().filter((m) => plano[m.slug]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let fPlDia = 'todos', fPlMat = 'todos';
const topAbertos = {}; // slug -> mostrar todos os tópicos (não persiste)

function GrupoChips({ grupo, label, itens, sel, onToggle }) {
  return h('fieldset', { class: 'chips chips-quebra plano-grupo' },
    h('legend', { class: 'chips-label' }, label),
    itens.map(([v, txt, aria]) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(sel.includes(v)), 'aria-label': aria, 'data-foco': `${grupo}-${v}`,
      onclick: () => onToggle(v),
    }, txt)));
}
function ChipsDia({ sel, onToggle, label, grupo, todos }) {
  const itens = ORDEM.map((d) => [d, DIA_CURTO[d], DIA_LONGO[d]]);
  if (todos) itens.unshift(['todos', 'Todos']);
  return GrupoChips({ grupo, label, itens, sel: todos && !sel.length ? ['todos'] : sel, onToggle });
}
function LinkYoutube(topico, materia) {
  const txt = topico ? 'Buscar aulas no YouTube' : `Buscar aulas de ${materia} no YouTube`;
  return h('a', {
    class: 'btn plano-link', href: linkYoutube(materia, topico), target: '_blank', rel: 'noopener noreferrer',
    'aria-label': `${topico ? `Buscar aulas no YouTube: ${topico}` : txt} (abre em nova aba)`,
  }, txt, ic('arrow-square-out'));
}
function Contagem() {
  return h('div', { class: 'plano-contagem' },
    h('p', { class: 'plano-cont-t' }, textoContagem(diasAte(DATA_ENEM, hoje()))),
    h('p', { class: 'meta' }, 'data prevista, confira no site do INEP'));
}
function EditorPlano(plano, onChange, aberto, onAbre, onDur) {
  const mats = planoMats();
  const marca = (slug) => {
    const n = { ...plano }, nome = nomeMateria(slug);
    if (n[slug]) { delete n[slug]; onChange(n, `${nome} removida do plano`, `[data-foco="mat-${slug}"]`); } else { n[slug] = []; onChange(n, `${nome} adicionada ao plano`, `[data-foco="mat-${slug}"]`); }
  };
  const dia = (slug, d) => {
    const n = { ...plano }, tem = n[slug].includes(d);
    n[slug] = tem ? n[slug].filter((x) => x !== d) : [...n[slug], d];
    onChange(n, `${cap(DIA_LONGO[d])} ${tem ? 'desmarcada' : 'marcada'} em ${nomeMateria(slug)}`, `[data-foco="d-${slug}-${d}"]`);
  };
  const det = h('details', { class: 'plano-editor card' },
    h('summary', {}, 'Meu plano'),
    h('div', { class: 'det-body' },
      GrupoChips({ grupo: 'mat', label: 'Matérias que vou estudar', itens: mats.map((m) => [m.slug, m.nome]), sel: Object.keys(plano), onToggle: marca }),
      matsDoPlano(plano).map((m) => h('div', { class: 'plano-par' },
        ChipsDia({ grupo: `d-${m.slug}`, label: `Dias de ${m.nome}`, sel: plano[m.slug], onToggle: (d) => dia(m.slug, d) }),
        GrupoChips({ grupo: `dur-${m.slug}`, label: `Tempo de ${m.nome} por sessão`, itens: [25, 45, 60, 90].map((n) => [n, `${n} min`, `${n} minutos`]), sel: [durDe(m.slug)], onToggle: (n) => onDur(m.slug, n) })))));
  det.open = aberto;
  det.addEventListener('toggle', () => onAbre(det.open));
  return det;
}
/* ---------- estudo: aviso do dia, sessão com timer, técnicas e resumo ---------- */
const durDe = (slug) => duracaoDe(objeto('escola:duracao'), slug);
const avisoHoje = () => { const v = ld('escola:aviso', ''); return typeof v === 'string' ? v : ''; }; // string: nunca objeto()
const diaMats = (plano) => matsDoPlano(plano).filter((m) => plano[m.slug].includes(diaSemana(hoje())));
const permNotif = () => { try { return 'Notification' in window ? Notification.permission : null; } catch { return null; } }; // null = sem suporte
function notifica(txt, tag) { try { if (permNotif() === 'granted') new Notification('Escola', { body: txt, tag }); } catch { /* alguns navegadores móveis lançam */ } }
let avisoSeq = 0, notificouDia = false;
function AvisoEstudo({ plano, onComecar, onDispensa, primario }) {
  const id = `av-t${++avisoSeq}`, ms = diaMats(plano), n = ms.reduce((t, m) => t + durDe(m.slug), 0);
  const txt = `Hoje é dia de estudar ${ms.map((m) => m.nome).join(', ')}: ${n} min`;
  const nota = h('div', { class: 'estudo-aviso-nota' });
  const tit = h('h2', { id, class: 'estudo-aviso-t', tabindex: '-1' }, txt);
  const pintaNota = () => {
    const p = permNotif();
    nota.replaceChildren(...(p === 'denied' ? [h('p', { class: 'meta' }, 'Avisos do navegador bloqueados. O aviso continua aparecendo aqui no app.')]
      : p === 'default' ? [h('button', { type: 'button', class: 'btn btn-ghost', onclick: pede }, 'Ativar avisos do navegador'), h('p', { class: 'meta' }, 'Funciona só com o site aberto; não enviamos avisos com ele fechado.')] : []));
  };
  function pede() {
    const fim = () => { if (permNotif() === 'granted') live('Avisos ativados'); pintaNota(); tit.focus({ preventScroll: true }); };
    try { Promise.resolve(Notification.requestPermission()).then(fim, fim); } catch { fim(); }
  }
  pintaNota();
  if (!notificouDia) { notificouDia = true; notifica(txt, 'estudo-dia'); }
  return h('section', { class: 'card estudo-aviso', 'aria-labelledby': id },
    ic('calendar-check'),
    h('div', { class: 'estudo-aviso-c' }, tit,
      h('div', { class: 'plano-acoes' }, h('button', { type: 'button', class: primario ? 'btn btn-primary' : 'btn', onclick: () => onComecar(ms[0].slug) }, ic('play'), 'Começar')), nota),
    h('button', { type: 'button', class: 'btn btn-ghost estudo-aviso-x', 'aria-label': 'Dispensar aviso de hoje', onclick: onDispensa }, ic('x')));
}
/** Aviso do dia (Agenda e Início), ou null: sem sessão aberta, com matéria hoje, 0 min hoje e não dispensado. */
function avisoNode(onComecar, onDispensa, primario) {
  const plano = lerPlano();
  return (!ses || ses.est === 'fim') && deveAvisar(plano, objeto('escola:estudo'), avisoHoje(), hoje()) ? AvisoEstudo({ plano, onComecar, onDispensa, primario }) : null;
}
const barra = (pct) => { const f = h('span', { class: 'bar-f' }); f.style.setProperty('--p', String(pct)); return h('span', { class: 'bar', 'aria-hidden': 'true' }, f); };
function ResumoSemana(plano) {
  const r = resumoSemana(plano, objeto('escola:duracao'), objeto('escola:estudo'), hoje());
  return h('section', { class: 'resumo-semana', 'aria-label': 'Resumo da semana' },
    h('p', { class: 'resumo-t' }, `Você estudou ${r.feito} min de ${r.planejado} planejados`),
    barra(r.planejado > 0 ? pctDe(r.feito, r.planejado) : 0),
    r.planejado > 0 && r.feito >= r.planejado && h('p', { class: 'meta' }, 'Meta da semana cumprida'));
}
function TecnicasEstudo() {
  const t = [
    ['Pomodoro', 'Estude 25 minutos sem distração e descanse 5. Repita. Depois de 4 ciclos, faça uma pausa longa de 15 a 30 minutos. O app também tem 50/10 e bloco único.'],
    ['Revisão espaçada', 'Revise o conteúdo depois de 1 dia, 1 semana e 1 mês. Rever aos poucos fixa mais do que reler tudo de uma vez.'],
    ['Prática ativa com questões', 'Resolva questões em vez de só reler o resumo. Errar e entender o erro ensina mais do que acertar de primeira.'],
    ['Pausa e sono', 'Pausas curtas mantêm a atenção e a pausa longa, depois de vários ciclos, descansa a mente. Dormir bem ajuda a fixar o que você estudou.'],
  ];
  return h('details', { class: 'card estudo-tec' }, h('summary', {}, 'Técnicas de estudo'),
    h('div', { class: 'det-body' }, t.map(([a, b]) => h('div', { class: 'estudo-tec-i' }, h('h3', {}, a), h('p', {}, b)))));
}

/* sessão: o estado vive no módulo (sobrevive a sair da Agenda, não a recarregar); o tempo sai só de Date.now() */
let ses = null, tick = null, sesBox = null, sesSai = null, ui = null, ac = null, preAberta = null;
const pad2 = (n) => String(n).padStart(2, '0');
const relogio = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };
const paraTick = () => { clearInterval(tick); tick = null; };
const iniciaTick = () => { paraTick(); tick = setInterval(passo, 250); };
const focaSes = (sel) => { const n = sesBox && $(sel, sesBox); if (n) n.focus({ preventScroll: true }); };
function abrePre(slug) {
  if (ses && (ses.est === 'run' || ses.est === 'pausado')) return;
  ses = { slug, tec: 'p25', min: durDe(slug), est: 'pre', s: null, gravado: 0, xp0: 0, ultSeg: -1, ultFase: 0, marcos: {}, som: false, natural: false };
}
function beep() {
  try {
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; g.gain.value = 0.1; o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.2);
  } catch { /* sem áudio */ }
}
/** Soma os minutos inteiros de foco ainda não gravados em escola:estudo[hoje] (idempotente: só o delta). */
function grava(focoMs) {
  const n = Math.floor(focoMs / 60000) - ses.gravado;
  if (n <= 0) return;
  const est = { ...objeto('escola:estudo') }, d = hoje();
  est[d] = Math.min(1440, (Number.isInteger(est[d]) ? est[d] : 0) + n);
  sv('escola:estudo', est);
  ses.gravado += n;
}
function rotulo(e) {
  ui.rot.replaceChildren(ic(e.tipo === 'foco' ? 'target' : 'timer'), e.tipo === 'foco' ? 'Foco' : 'Pausa');
  if (ui.cic) ui.cic.textContent = `Ciclo ${e.ciclo} de ${e.ciclos}`;
  ui.bar.classList.toggle('timer-pausa', e.tipo === 'pausa');
}
function mostraTempo(e) {
  const seg = Math.ceil(e.restanteMs / 1000);
  if (seg === ses.ultSeg) return; // só repinta quando o segundo muda
  ses.ultSeg = seg;
  const t = relogio(e.restanteMs);
  ui.dig.textContent = t;
  ui.fill.style.setProperty('--p', String(Math.round((1 - e.restanteMs / ses.s.fases[e.fase].ms) * 1000) / 10));
  document.title = `${t} ${e.tipo === 'foco' ? 'Foco' : 'Pausa'}`;
}
function passo() {
  if (!ses || ses.est !== 'run' || !ui || !ativa('agenda')) return;
  const e = estadoEm(ses.s, Date.now()), fases = ses.s.fases;
  if (e.fim) { conclui(true); return; }
  if (e.fase !== ses.ultFase) {
    ses.ultFase = e.fase; ses.ultSeg = -1;
    grava(e.focoMs);
    const txt = e.tipo === 'pausa' ? `Pausa de ${fases[e.fase].ms / 60000} minutos começou` : `Foco: ciclo ${e.ciclo} de ${e.ciclos}`;
    live(txt); if (document.hidden) notifica(txt, 'estudo-fase'); if (ses.som) beep();
    rotulo(e);
  } else if (e.tipo === 'foco') {
    const k1 = `${e.fase}-1`, k5 = `${e.fase}-5`, ms = fases[e.fase].ms;
    if (e.restanteMs <= 60000) { if (!ses.marcos[k1]) { ses.marcos[k1] = ses.marcos[k5] = 1; if (ms > 60000) live('Falta 1 minuto'); } }
    else if (e.restanteMs <= 300000 && !ses.marcos[k5]) { ses.marcos[k5] = 1; if (ms > 300000) live(`Faltam ${Math.ceil(e.restanteMs / 60000)} minutos`); }
  }
  mostraTempo(e);
}
function conclui(natural) {
  const e = estadoEm(ses.s, Date.now());
  grava(e.focoMs); paraTick();
  ses.est = 'fim'; ses.natural = natural; ui = null;
  document.title = 'Agenda · Escola';
  const n = ses.gravado;
  live(natural ? `Sessão concluída: ${n} min de foco` : `Você registrou ${n} min`);
  if (natural) { if (document.hidden) notifica('Sessão concluída', 'estudo-fase'); if (ses.som) beep(); }
  pintaSes(); focaSes('#ses-t');
}
function iniciar() {
  ses.s = { fases: listaFases(fasesDe(ses.tec, ses.min)), acumMs: 0, desde: Date.now() };
  ses.est = 'run'; ses.gravado = 0; ses.ultSeg = -1; ses.ultFase = 0; ses.marcos = {};
  ses.xp0 = xpEstudo(objeto('escola:estudo'));
  pintaSes(); iniciaTick(); focaSes('.btn-primary');
}
function pausar() {
  passo();
  if (!ses || ses.est !== 'run') return;
  const agora = Date.now();
  ses.s.acumMs += agora - ses.s.desde; ses.s.desde = null; ses.est = 'pausado';
  paraTick(); grava(estadoEm(ses.s, agora).focoMs);
  document.title = 'Agenda · Escola';
  live('Sessão pausada'); pintaSes(); focaSes('.btn-primary');
}
function retomar() {
  ses.s.desde = Date.now(); ses.est = 'run'; ses.ultSeg = -1;
  pintaSes(); iniciaTick(); passo(); focaSes('.btn-primary');
}
function encerrar() {
  passo();
  if (ses && (ses.est === 'run' || ses.est === 'pausado')) conclui(false);
}
const planoMin = () => `Planejado: ${ses.min} min`;
function pintaSes() {
  if (!sesBox || !ses) return;
  sesBox.className = `card estudo-sessao mt-${ses.slug}`;
  ui = null;
  const nome = nomeMateria(ses.slug), tit = h('h2', { id: 'ses-t', class: 'sessao-t', tabindex: '-1' }, `${nome} · ${TECNICAS[ses.tec].nome}`);
  if (ses.est === 'pre') {
    ses.min = durDe(ses.slug);
    const hojeMs = diaMats(lerPlano()), f = fasesDe(ses.tec, ses.min);
    const re = (foco) => { pintaSes(); focaSes(foco); };
    const som = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(ses.som), onclick: (ev) => {
      ses.som = !ses.som;
      try { if (ses.som && !ac) ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ses.som = false; }
      ev.currentTarget.setAttribute('aria-pressed', String(ses.som));
    } }, 'Aviso sonoro');
    mostra(sesBox,
      h('button', { type: 'button', class: 'btn btn-ghost sessao-volta', onclick: () => { ses = null; sesSai(); } }, 'Voltar ao plano'),
      tit,
      hojeMs.length > 1 && GrupoChips({ grupo: 'ses-m', label: 'Matéria', itens: hojeMs.map((m) => [m.slug, m.nome]), sel: [ses.slug], onToggle: (v) => { ses.slug = v; re(`[data-foco="ses-m-${v}"]`); } }),
      GrupoChips({ grupo: 'ses-t', label: 'Técnica', itens: Object.keys(TECNICAS).map((k) => [k, TECNICAS[k].nome]), sel: [ses.tec], onToggle: (v) => { ses.tec = v; re(`[data-foco="ses-t-${v}"]`); } }),
      h('div', { class: 'chips chips-quebra' }, som),
      h('p', { class: 'meta' }, f.ciclos > 1 ? `${planoMin()} · ${f.ciclos} ciclos de foco` : planoMin()),
      h('div', { class: 'sessao-acoes' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: iniciar }, ic('play'), 'Iniciar')));
    return;
  }
  if (ses.est === 'fim') {
    const n = ses.gravado, xp = xpEstudo(objeto('escola:estudo')) - ses.xp0;
    mostra(sesBox,
      h('h2', { id: 'ses-t', class: 'sessao-t', tabindex: '-1' }, ses.natural ? `Sessão concluída: ${n} min de foco${xp > 0 ? `, +${xp} XP` : ''}` : `Você registrou ${n} min`),
      !ses.natural && xp > 0 && h('p', { class: 'meta' }, `+${xp} XP`),
      h('p', { class: 'meta' }, `${nome} · ${TECNICAS[ses.tec].nome}`),
      h('div', { class: 'sessao-acoes' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { ses = null; sesSai(); } }, 'Voltar ao plano'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { abrePre(ses.slug); pintaSes(); focaSes('.btn-primary'); } }, 'Estudar de novo')));
    return;
  }
  const rodando = ses.est === 'run', e = estadoEm(ses.s, Date.now());
  const dig = h('p', { class: 'timer-dig', role: 'timer' }, relogio(e.restanteMs));
  const fill = h('span', { class: 'bar-f' }), bar = h('span', { class: 'bar timer-bar', 'aria-hidden': 'true' }, fill);
  const rot = h('span', { class: 'sessao-rot' }), cic = e.ciclos > 1 ? h('span', { class: 'meta' }) : null;
  ui = { dig, fill, bar, rot, cic };
  rotulo(e); fill.style.setProperty('--p', String(Math.round((1 - e.restanteMs / ses.s.fases[e.fase].ms) * 1000) / 10));
  mostra(sesBox, tit,
    h('p', { class: 'sessao-fase' }, rot, cic),
    dig, bar,
    h('p', { class: 'meta' }, rodando ? planoMin() : `${planoMin()} · pausado`),
    h('div', { class: 'sessao-acoes' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: rodando ? pausar : retomar }, rodando ? 'Pausar' : 'Retomar'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: encerrar }, 'Encerrar')));
  if (rodando) { ses.ultSeg = -1; mostraTempo(e); }
}
/** Bloco da sessão (no lugar de "Hoje"). Ao reabrir a Agenda com sessão rodando, recalcula e volta a andar. */
function Sessao(onSai) {
  sesBox = h('section', { class: 'card estudo-sessao', 'aria-labelledby': 'ses-t' });
  sesSai = onSai;
  pintaSes();
  if (ses.est === 'run') { passo(); if (ses && ses.est === 'run') iniciaTick(); }
  return sesBox;
}
document.addEventListener('visibilitychange', passo); // 1 vez no módulo; passo ignora se não há sessão rodando
/** Grava o delta de foco de uma sessão rodando (sem encerrá-la): saída da Agenda ou fechar a aba. grava é idempotente. */
function salvaRodando() { if (ses && ses.est === 'run' && ses.s) grava(estadoEm(ses.s, Date.now()).focoMs); }
window.addEventListener('hashchange', () => { if (!/^#agenda(\/|$)/.test(location.hash)) { salvaRodando(); paraTick(); } });
window.addEventListener('pagehide', salvaRodando);

function PlanoHoje(plano, onEditar, onEstudar, primaria) {
  const dow = diaSemana(hoje()), ms = diaMats(plano);
  return h('section', { class: 'card plano-hoje', 'aria-labelledby': 'pl-hoje-t' },
    h('p', { class: 'meta' }, cap(DIA_LONGO[dow])),
    h('h2', { id: 'pl-hoje-t', class: 'plano-hoje-t', tabindex: '-1' }, ms.length ? `Hoje: estudar ${ms.map((m) => m.nome).join(', ')}` : 'Hoje é dia livre. Aproveite para revisar um erro do Caderno.'),
    ms.length > 0 && h('ul', { class: 'list-clean plano-hoje-l' }, ms.map((m, i) => h('li', { class: `plano-hoje-i mt-${m.slug}` },
      h('span', { class: 'plano-hoje-n' }, `${m.nome} · ${durDe(m.slug)} min`),
      h('button', { type: 'button', class: i === 0 && primaria ? 'btn btn-primary' : 'btn', 'aria-label': `Estudar ${m.nome}`, onclick: () => onEstudar(m.slug) }, ic('play'), 'Estudar'),
      h('a', { class: 'btn btn-ghost', href: m.slug === 'redacao' ? '#repertorio' : `#${m.slug}/trilha`, 'aria-label': `Abrir matéria ${m.nome}` }, 'Abrir matéria')))),
    h('div', { class: 'plano-acoes' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: onEditar }, 'Editar plano')));
}
function SemanaPlano(plano, onFiltro, limpar) {
  const dow = diaSemana(hoje()), ms = matsDoPlano(plano);
  const linhas = ORDEM.filter((d) => fPlDia === 'todos' || d === fPlDia).map((d) => ({ d, m: ms.filter((x) => plano[x.slug].includes(d) && (fPlMat === 'todos' || x.slug === fPlMat)) }))
    .filter((l) => fPlMat === 'todos' || l.m.length);
  const sem = ms.filter((m) => !plano[m.slug].length && (fPlMat === 'todos' || m.slug === fPlMat));
  return h('section', { class: 'plano-semana', 'aria-labelledby': 'pl-sem-t' },
    h('h2', { id: 'pl-sem-t', class: 'hub-sub' }, 'Semana'),
    ChipsDia({ grupo: 'dia', label: 'Dia', sel: fPlDia === 'todos' ? [] : [fPlDia], todos: true, onToggle: (v) => onFiltro('dia', v) }),
    GrupoChips({ grupo: 'fm', label: 'Matéria', itens: [['todos', 'Todas'], ...ms.map((m) => [m.slug, m.nome])], sel: [fPlMat], onToggle: (v) => onFiltro('mat', v) }),
    linhas.length ? h('ul', { class: 'list-clean semana' }, linhas.map(({ d, m }) => h('li', { class: 'sem-dia', 'aria-current': d === dow ? 'date' : null },
      h('span', { class: 'sem-nome' }, h('span', { class: 'sem-curto', 'aria-hidden': 'true' }, DIA_CURTO[d]), h('span', { class: 'sem-longo' }, cap(DIA_LONGO[d]))),
      h('span', { class: 'sem-mats' }, m.length ? m.map((x) => h('span', { class: `tag mt-${x.slug}` }, x.nome)) : h('span', { class: 'meta' }, 'Dia livre'), d === dow && h('span', { class: 'tag tag-warn' }, ic('calendar-check'), 'Hoje')))))
      : vazio('Nada com esse filtro.', 'Limpar filtros', limpar),
    sem.map((m) => h('p', { class: 'meta' }, `Escolha os dias de ${m.nome}`)));
}
function AulasVideo(plano) {
  const ms = matsDoPlano(plano).filter((m) => fPlMat === 'todos' || m.slug === fPlMat);
  const bloco = (m) => {
    const lst = h('div', { class: 'plano-topicos' });
    const pinta = (tops) => {
      if (!tops) {
        lst.replaceChildren(h('p', {}, 'Não foi possível carregar os tópicos.'),
          h('div', { class: 'plano-acoes' }, h('button', { type: 'button', class: 'btn', onclick: carrega }, 'Tentar de novo'), LinkYoutube(null, m.nome)));
        return;
      }
      const aberto = topAbertos[m.slug], vis = aberto ? tops : tops.slice(0, 5);
      lst.replaceChildren(h('ul', { class: 'list-clean' }, vis.map((t) => h('li', { class: 'video-item' }, h('span', { class: 'video-t' }, t.titulo), LinkYoutube(t.titulo, m.nome)))),
        !aberto && tops.length > 5 && h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { topAbertos[m.slug] = true; pinta(tops); } }, `Mostrar todos (${tops.length})`));
    };
    function carrega() {
      lst.replaceChildren(skeleton1(), skeleton1());
      (m.slug === 'redacao' ? Promise.resolve(TOP_REDACAO) : topicosDe(E.materias[m.slug])).then(pinta);
    }
    carrega();
    return h('div', { class: 'plano-mat' }, h('h3', { class: 'plano-mat-t' }, m.nome), lst);
  };
  return h('section', { class: 'plano-aulas', 'aria-labelledby': 'pl-aul-t' },
    h('h2', { id: 'pl-aul-t', class: 'hub-sub' }, 'Aulas em vídeo'),
    navigator.onLine === false && h('p', { class: 'meta' }, 'Precisa de internet'),
    ms.map(bloco));
}
const skeleton1 = () => h('div', { class: 'skel', 'aria-hidden': 'true' });
function viewAgenda(el) {
  const lst = h('div', { class: 'ag-lista', tabindex: '-1' });
  const refaz = (sel) => { if (!ativa('agenda')) return; pinta(); if (sel) { const n = $(sel, el); if (n) n.focus({ preventScroll: true }); } }; // só a lista: o form mantém o texto digitado
  const acoes = {
    concluir: (id) => {
      const l = lista('escola:agenda'), x = l.find((y) => y.id === id);
      if (!x) return;
      x.feito = !x.feito; sv('escola:agenda', l);
      live(x.feito ? `Concluído: ${x.titulo}` : `Reaberto: ${x.titulo}`);
      refaz(`[data-ag="${CSS.escape(id)}"] input`);
    },
    remover: (id) => {
      const l = lista('escola:agenda'), i = l.findIndex((y) => y.id === id);
      if (i < 0) return;
      const [x] = l.splice(i, 1); sv('escola:agenda', l);
      refaz(form.open ? '#a-tit' : '.ag-lista');
      toastDesfazer('Removido.', () => { const l2 = lista('escola:agenda'); l2.splice(Math.min(i, l2.length), 0, x); sv('escola:agenda', l2); live('Item restaurado.'); refaz(`[data-ag="${CSS.escape(id)}"] input`); });
    },
  };
  const form = FormAgenda((x) => { sv('escola:agenda', [...lista('escola:agenda'), x]); live('Adicionado à agenda.'); refaz(`[data-ag="${CSS.escape(x.id)}"] input`); });
  function pinta() {
  const itens = agenda();
  const vis = itens.filter((x) => fAg === 'todos' || x.tipo === fAg).sort((a, b) => a.data.localeCompare(b.data));
  const chips = h('div', { class: 'chips chips-quebra', role: 'group', 'aria-label': 'Tipo' },
    [['todos', 'Todos'], ...TIPOS.map((t) => [t[0], t[2]])].map(([v, s]) =>
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(fAg === v), onclick: () => { fAg = v; refaz(`.chip[data-v="${v}"]`); }, 'data-v': v }, s)));
  let corpo;
  if (!itens.length) corpo = vazio('Nada agendado. Adicione uma prova ou tarefa.', 'Adicionar', () => { form.open = true; $('#a-tit').focus(); });
  else if (!vis.length) corpo = vazio('Nenhum item com esse filtro.', 'Limpar filtro', () => { fAg = 'todos'; refaz('.chip[data-v="todos"]'); });
  else {
    corpo = h('div', { class: 'ag-grupos' }, GRUPOS.map((g) => {
      const doGrupo = vis.filter((x) => grupoDe(x) === g);
      return doGrupo.length ? h('section', { class: 'ag-grupo', 'aria-label': g }, h('h2', { class: 'ag-gt' }, `${g} (${doGrupo.length})`), h('ul', { class: 'list-clean' }, doGrupo.map((x) => ItemAgenda(x, acoes)))) : null;
    }));
  }
  lst.replaceChildren(chips, corpo);
  }
  pinta();
  /* planejador: nó e repintura próprios; o form de compromissos nunca é refeito (texto digitado fica) */
  const planoBox = h('div', { class: 'plano-box' });
  if (preAberta) { abrePre(preAberta); preAberta = null; }
  let editorAberto = !Object.keys(lerPlano()).length;
  const refazPlano = (sel) => { if (!ativa('agenda')) return; pintaPlano(); if (sel) { const n = $(sel, planoBox); if (n) n.focus({ preventScroll: true }); } };
  const onPlano = (novo, msg, foco) => { sv('escola:plano', normPlano(novo, planoMats().map((m) => m.slug))); live(msg); refazPlano(foco); };
  const abreEditor = () => { editorAberto = true; refazPlano('.plano-editor .chip'); };
  const onFiltro = (g, v) => { if (g === 'dia') fPlDia = v; else fPlMat = v; refazPlano(`[data-foco="${CSS.escape(g === 'dia' ? 'dia-' + v : 'fm-' + v)}"]`); };
  const limpar = () => { fPlDia = 'todos'; fPlMat = 'todos'; refazPlano('[data-foco="dia-todos"]'); };
  const comecar = (slug) => { abrePre(slug); refazPlano('.estudo-sessao .btn-primary'); };
  const dispensa = () => { sv('escola:aviso', hoje()); refazPlano('.plano-hoje-t'); };
  const onSai = () => { ses = null; ui = null; sesBox = null; refazPlano('.plano-hoje-t'); };
  const onDur = (slug, n) => { sv('escola:duracao', { ...objeto('escola:duracao'), [slug]: n }); live(`${nomeMateria(slug)}: ${n} minutos por sessão`); refazPlano(`[data-foco="dur-${CSS.escape(slug)}-${n}"]`); };
  function pintaPlano() {
    const plano = lerPlano(), tem = Object.keys(plano).length > 0;
    if (fPlMat !== 'todos' && !plano[fPlMat]) fPlMat = 'todos';
    const aviso = tem ? avisoNode(comecar, dispensa, true) : null;
    mostra(planoBox, aviso,
      ses ? Sessao(onSai)
        : tem ? PlanoHoje(plano, abreEditor, comecar, !aviso) : h('div', { class: 'state' }, h('p', {}, 'Você ainda não montou seu plano. Escolha as matérias e os dias.'), h('button', { type: 'button', class: 'btn btn-primary', onclick: abreEditor }, 'Montar meu plano')),
      tem && ResumoSemana(plano),
      Contagem(),
      EditorPlano(plano, onPlano, editorAberto, (o) => { editorAberto = o; }, onDur),
      tem && SemanaPlano(plano, onFiltro, limpar),
      TecnicasEstudo(),
      tem && AulasVideo(plano));
  }
  pintaPlano();
  mostra(el, avisoStorage(), h('div', { class: 'agenda-wrap' }, planoBox,
    h('section', { class: 'ag-comp', 'aria-labelledby': 'ag-comp-t' }, h('h2', { id: 'ag-comp-t', class: 'hub-sub' }, 'Compromissos'), form, lst)));
  pronto(el);
}

/* ---------- Biblioteca ---------- */
/* Acervo fictício: títulos e autores inventados. capa = cor --cover-N. */
const LIVROS = [
  { id: 'l1', titulo: 'Os Mapas de Sal', autor: 'Teodora Vasques', materia: 'geografia', capa: 1 },
  { id: 'l2', titulo: 'A Casa dos Ventos Lentos', autor: 'Ícaro Belmonte', materia: 'historia', capa: 2 },
  { id: 'l3', titulo: 'Equações do Entardecer', autor: 'Lívia Quaresma', materia: 'mat', capa: 3 },
  { id: 'l4', titulo: 'O Jardim das Moléculas', autor: 'Ramiro Tavares', materia: 'quimica', capa: 4 },
  { id: 'l5', titulo: 'Cartas ao Rio Esquecido', autor: 'Helena Duarte', materia: 'redacao', capa: 5 },
  { id: 'l6', titulo: 'Pequeno Tratado das Dúvidas', autor: 'Otávio Brandão', materia: 'filosofia', capa: 6 },
  { id: 'l7', titulo: 'A Feira dos Cem Ofícios', autor: 'Noêmia Fontoura', materia: 'sociologia', capa: 1 },
  { id: 'l8', titulo: 'Luz em Queda Livre', autor: 'Caetano Mirandela', materia: 'fisica', capa: 2 },
  { id: 'l9', titulo: 'O Código das Samambaias', autor: 'Aurora Pimentel', materia: 'biologia', capa: 3 },
  { id: 'l10', titulo: 'Mesa para Quatro Séculos', autor: 'Valdemar Cunha', materia: 'historia', capa: 4 },
  { id: 'l11', titulo: 'Fronteiras de Papel', autor: 'Cecília Andrade', materia: 'geografia', capa: 5 },
  { id: 'l12', titulo: 'Quando o Silêncio Argumenta', autor: 'Raul Teixeira', materia: 'redacao', capa: 6 },
];
const STATUS = [['quero', 'Quero ler', 'Marcado como quero ler'], ['lido', 'Lido', 'Marcado como lido']];
let fLv = 'todos', mLv = '';
const nCaps = (caps, id) => (Array.isArray(caps[id]) ? caps[id].filter((x) => x === 1).length : 0);
function Livro(l, st, onSt, n) {
  const mn = nomeMateria(l.materia), le = COM_TEXTO.includes(l.id);
  const capa = h('div', { class: `capa capa-${l.capa}` }, h('p', { class: 'capa-t' }, l.titulo), h('p', { class: 'capa-a' }, l.autor), le && icon('caret-right'));
  return h('li', { class: le ? 'livro' : 'livro livro-breve', 'data-livro': l.id },
    le
      ? h('a', { class: 'livro-link', href: `#livro/${l.id}`, 'aria-label': `Ler: ${l.titulo}, ${n} de 3 capítulos` }, capa, h('span', { class: 'livro-prog' }, `${n} de 3`))
      : capa,
    h('div', { class: 'livro-m' },
      mn && h('span', { class: 'tag' }, mn),
      !le && h('span', { class: 'tag tag-breve' }, 'Em breve'),
      h('div', { class: 'livro-st' }, STATUS.map(([v, s]) =>
        h('button', { type: 'button', class: 'chip', 'data-st': v, 'aria-pressed': String(st === v), 'aria-label': `${s}: ${l.titulo}`, onclick: () => onSt(l.id, v) }, st === v && icon('check'), s)))));
}
function Estante(livros, filtro, marcas, onSt, limpar, caps) {
  if (!livros.length) return vazio('Nenhum livro com esse filtro.', 'Limpar filtro', limpar);
  return h('ul', { class: 'estante' }, livros.map((l) => Livro(l, marcas[l.id] || null, onSt, nCaps(caps, l.id))));
}
function viewBiblioteca(el) {
  const marcas = objeto('escola:livros');
  const refaz = (sel) => { if (!ativa('biblioteca')) return; viewBiblioteca(el); if (sel) { const n = $(sel, el); if (n) n.focus({ preventScroll: true }); } };
  const onSt = (id, v) => {
    const m = { ...objeto('escola:livros') };
    if (m[id] === v) { delete m[id]; live('Marcação removida'); } else { m[id] = v; live(STATUS.find((s) => s[0] === v)[2]); }
    sv('escola:livros', m);
    const au = objeto('escola:auto');
    if (au[id]) { const a2 = { ...au }; delete a2[id]; sv('escola:auto', a2); } // marcação manual: o "Lido" deixa de ser automático
    refaz(`[data-livro="${CSS.escape(id)}"] [data-st="${v}"]`);
  };
  const limpar = () => { fLv = 'todos'; mLv = ''; refaz('.chip[data-v="todos"]'); };
  const vis = LIVROS.filter((l) => (fLv === 'todos' || marcas[l.id] === fLv) && (!mLv || l.materia === mLv));
  const lidos = LIVROS.filter((l) => marcas[l.id] === 'lido').length;
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Situação' },
    [['todos', 'Todos'], ['quero', 'Quero ler'], ['lido', 'Lido']].map(([v, s]) =>
      h('button', { type: 'button', class: 'chip', 'data-v': v, 'aria-pressed': String(fLv === v), onclick: () => { fLv = v; refaz(`.chip[data-v="${v}"]`); } }, s)));
  const sel = h('select', { id: 'b-mat', onchange: () => { mLv = sel.value; refaz('#b-mat'); } },
    h('option', { value: '' }, 'Todas'), [{ slug: 'redacao', nome: 'Redação' }, ...MAT()].map((m) => h('option', { value: m.slug, selected: m.slug === mLv }, m.nome)));
  const n = vis.length;
  mostra(el, 
    avisoStorage(),
    h('p', { class: 'aviso' }, 'Acervo fictício: títulos e autores inventados para a demonstração.'),
    h('div', { class: 'filtros-b' }, chips, h('div', { class: 'campo campo-linha' }, h('label', { for: 'b-mat' }, 'Matéria'), sel)),
    h('p', { class: 'count' }, `${n} ${n === 1 ? 'livro' : 'livros'} · ${lidos} ${lidos === 1 ? 'lido' : 'lidos'}`),
    Estante(vis, fLv, marcas, onSt, limpar, objeto('escola:caps')));
  pronto(el);
}

/* ---------- Livro legível (#livro/<id>): texto de data/livros.json, capítulos marcáveis ---------- */
let livrosDados = null;
const carregaLivros = () => livrosDados || (livrosDados = fetch('data/livros.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then((d) => (d && Array.isArray(d.livros) ? d.livros : Promise.reject(new Error('formato')))).catch((e) => { livrosDados = null; throw e; }));
function viewLivro(el, id) {
  if (!COM_TEXTO.includes(id)) { mostra(el, vazio('Livro não encontrado.', 'Voltar à Biblioteca', () => { location.hash = '#biblioteca'; })); pronto(el); return; }
  skeleton(el);
  carregaLivros().then((ls) => {
    const lv = ls.find((x) => x && x.id === id);
    if (!lv || !Array.isArray(lv.capitulos) || lv.capitulos.length !== 3) throw new Error('formato');
    if (location.hash === '#livro/' + id) livroTela(el, lv);
  }).catch(() => erroEstado(el, () => viewLivro(el, id)));
}
function livroTela(el, lv) {
  const meta = LIVROS.find((x) => x.id === lv.id);
  const lidos = () => { const c = objeto('escola:caps')[lv.id]; return Array.isArray(c) && c.length === 3 ? c.map((x) => (x === 1 ? 1 : 0)) : [0, 0, 0]; };
  const prog = h('progress', { max: '3', value: '0', 'aria-label': 'Capítulos lidos' });
  const progTxt = h('span', { class: 'livro-prog-txt' });
  const btns = [], secs = [];
  const atualiza = () => {
    const c = lidos(), n = c.filter((x) => x === 1).length, prox = c.indexOf(0);
    prog.value = n; progTxt.textContent = `${n} de 3 capítulos`;
    btns.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(c[i] === 1));
      b.classList.toggle('btn-primary', i === prox);
      b.replaceChildren(...(c[i] === 1 ? [icon('check')] : []), 'Marcar capítulo como lido');
      secs[i].classList.toggle('cap-lida', c[i] === 1);
    });
  };
  const clique = (i) => {
    const r = marcaCap({ livros: objeto('escola:livros'), caps: { ...objeto('escola:caps'), [lv.id]: lidos() }, auto: objeto('escola:auto') }, lv.id, i);
    sv('escola:caps', r.caps); sv('escola:livros', r.livros); sv('escola:auto', r.auto);
    atualiza();
    live(r.ev === 'concluido' ? `Livro concluído: ${lv.titulo}. Marcado como lido` : r.ev === 'voltou' ? 'Livro voltou para quero ler'
      : `Capítulo ${i + 1} ${r.caps[lv.id][i] === 1 ? 'marcado como lido' : 'desmarcado'}`);
  };
  const caps = lv.capitulos.map((c, i) => {
    const b = h('button', { type: 'button', class: 'chip btn-cap', 'data-cap': String(i), 'aria-pressed': 'false', 'aria-label': `Marcar capítulo ${i + 1} como lido: ${c.titulo}`, onclick: () => clique(i) });
    btns.push(b);
    const sec = h('section', { class: 'cap', 'aria-labelledby': `cap-h${i}` },
      h('h3', { id: `cap-h${i}` }, `Capítulo ${i + 1} · ${c.titulo}`),
      String(c.texto).split(/\n\s*\n/).map((p) => h('p', {}, p)), b);
    secs.push(sec);
    return sec;
  });
  mostra(el, avisoStorage(),
    h('a', { class: 'voltar', href: '#biblioteca' }, 'Voltar à Biblioteca'),
    h('header', { class: 'livro-topo' },
      h('div', { class: `capa capa-${meta ? meta.capa : 1}`, 'aria-hidden': 'true' }, h('p', { class: 'capa-t' }, lv.titulo), h('p', { class: 'capa-a' }, lv.autor)),
      h('div', { class: 'livro-cab' }, h('h2', {}, lv.titulo), h('p', { class: 'meta' }, lv.autor))),
    h('p', { class: 'aviso' }, 'Acervo fictício: títulos e autores inventados para a demonstração.'),
    h('div', { class: 'livro-prog-bar' }, prog, progTxt),
    h('p', { class: 'livro-sinopse' }, lv.sinopse),
    caps);
  atualiza();
  pronto(el);
}

/* ---------- Teste antes e depois (feira): 2 blocos de 5 questões, nota salva em escola:teste ---------- */
let testeDados = null, depoisLib = false; // depoisLib só em memória: o validador de escola:teste descarta chaves extras
const carregaTeste = () => testeDados || (testeDados = fetch('data/teste.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then((d) => (d && Array.isArray(d.blocos) ? d.blocos : Promise.reject(new Error('formato')))).catch((e) => { testeDados = null; throw e; }));
const pts = (n) => `${n} ${n === 1 ? 'ponto' : 'pontos'}`;
const difTexto = (a, d) => (d > a ? `Melhorou ${pts(d - a)}` : d === a ? 'Ficou igual' : `Piorou ${pts(a - d)}`);
function viewTeste(el) {
  carregaTeste().then((blocos) => testeTela(el, blocos), () => erroEstado(el, () => { skeleton(el); viewTeste(el); }));
}
function testeTela(el, blocos, rev, conf) {
  const t = objeto('escola:teste'), bl = (id) => blocos.find((b) => b.id === id);
  const prox = !t.antes ? 'antes' : !t.depois ? 'depois' : null;
  const foco = (sel) => { const n = $(sel, el); if (n) n.focus({ preventScroll: true }); };
  const nota = (id) => t[id] && h('li', {}, h('strong', {}, bl(id).titulo), `: ${t[id].nota} de 5 · ${ddmm(t[id].data)}`);
  let corpo;
  if (prox) {
    const b = bl(prox), erro = h('p', { class: 'danger-txt', role: 'alert', hidden: true });
    const form = h('form', { class: 'teste-form', novalidate: true, 'aria-labelledby': 'teste-bloco',
      onsubmit: (ev) => {
        ev.preventDefault();
        const resp = b.questoes.map((_, i) => { const r = form.querySelector(`input[name="q${i}"]:checked`); return r ? Number(r.value) : -1; });
        const falta = resp.indexOf(-1);
        if (falta >= 0) { erro.textContent = `Responda a questão ${falta + 1} para conferir.`; erro.hidden = false; form.querySelector(`input[name="q${falta}"]`).focus(); return; }
        const n = resp.filter((v, i) => v === b.questoes[i].correta).length;
        sv('escola:teste', { ...objeto('escola:teste'), [prox]: { nota: n, data: hoje() } });
        testeTela(el, blocos, { id: prox, resp });
        foco('#teste-res');
        live(`${b.titulo}: ${n} de 5.${prox === 'depois' ? ' ' + difTexto(objeto('escola:teste').antes.nota, n) + '.' : ''}`);
      } },
    b.questoes.map((q, i) => h('fieldset', { class: 'card teste-q' },
      h('legend', {}, `${i + 1}. ${q.enunciado}`, h('span', { class: 'tag' }, q.materia)),
      q.alternativas.map((a, k) => h('label', { class: 'teste-alt' }, h('input', { type: 'radio', name: `q${i}`, value: String(k) }), h('span', {}, a))))),
    erro, h('button', { type: 'submit', class: 'btn btn-primary' }, `Conferir ${b.titulo.toLowerCase()}`));
    corpo = prox === 'depois' && !depoisLib
      ? [h('h2', { id: 'teste-bloco', class: 'teste-h', tabindex: '-1' }, 'Antes salvo'),
        h('p', { class: 'meta', role: 'status' }, 'Agora estude no app e volte para o teste Depois'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'teste-libera', onclick: () => { depoisLib = true; testeTela(el, blocos); foco('#teste-bloco'); } }, 'Liberar o Depois')]
      : [h('h2', { id: 'teste-bloco', class: 'teste-h', tabindex: '-1' }, `${b.titulo}: 5 questões`),
      h('p', { class: 'meta' }, prox === 'antes' ? 'Responda antes de estudar com o app. Marque uma alternativa em cada questão.' : 'Agora que você estudou, responda de novo. As questões são outras, no mesmo nível.'), form];
  } else {
    const a = t.antes.nota, d = t.depois.nota;
    corpo = [h('p', { class: 'teste-dif', id: 'teste-dif', tabindex: '-1' }, `${difTexto(a, d)}: de ${a} para ${d} de 5.`),
      conf
        ? h('div', { class: 'card teste-conf', role: 'group', 'aria-label': 'Confirmar' }, h('p', {}, 'Apagar as duas notas e refazer o teste?'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { sv('escola:teste', {}); depoisLib = false; testeTela(el, blocos); live('Teste reiniciado.'); foco('#teste-bloco'); } }, 'Sim, refazer'),
          h('button', { type: 'button', class: 'btn', onclick: () => { testeTela(el, blocos); foco('#teste-refazer'); } }, 'Cancelar'))
        : h('button', { type: 'button', class: 'btn', id: 'teste-refazer', onclick: () => { testeTela(el, blocos, null, true); foco('.teste-conf .btn'); } }, 'Refazer')];
  }
  const r = rev && bl(rev.id);
  mostra(el, avisoStorage(),
    h('p', {}, 'Experimento: responda o bloco Antes sem estudar, use o app por um tempo e depois responda o bloco Depois. A nota de cada um fica salva e o app mostra a diferença.'),
    (t.antes || t.depois) && h('ul', { class: 'list-clean teste-notas' }, nota('antes'), nota('depois')),
    r && h('div', { class: 'card teste-rev' }, h('h2', { id: 'teste-res', class: 'teste-h', tabindex: '-1' }, `Correção do ${r.titulo.toLowerCase()}`),
      h('ol', { class: 'list-clean' }, r.questoes.map((q, i) => {
        const ok = rev.resp[i] === q.correta;
        return h('li', {}, h('span', { class: ok ? 'tag tag-ok' : 'tag tag-danger' }, ic(ok ? 'check' : 'warning'), ok ? 'Certo' : 'Errado'),
          ` ${i + 1}. `, ok ? q.alternativas[q.correta] : `Você marcou "${q.alternativas[rev.resp[i]]}". Correta: "${q.alternativas[q.correta]}".`);
      }))),
    corpo);
  pronto(el);
}

/* ---------- rota ---------- */
const VIEWS = { inicio: viewInicio, materias: viewMaterias, agenda: viewAgenda, biblioteca: viewBiblioteca, teste: viewTeste };
function rotaEscola(r, primeira) {
  const s = r === 'livro' ? 'biblioteca' : r;
  const sec = $('#' + s);
  sec.hidden = false;
  registrarVisita();
  $('#h-' + s).textContent = TITULOS[s];
  const el = $('[data-escola-view]', sec);
  if (r === 'livro') {
    let id = '';
    try { id = decodeURIComponent(location.hash.split('/')[1] || ''); } catch { id = ''; }
    const lv = COM_TEXTO.includes(id) && LIVROS.find((x) => x.id === id);
    viewLivro(el, id);
    document.title = `${lv ? lv.titulo : 'Livro não encontrado'} · Escola`;
  } else {
    VIEWS[r](el);
    document.title = `${$('#h-' + s).textContent} · Escola`;
  }
  if (!primeira) { window.scrollTo(0, 0); $('#h-' + s).focus({ preventScroll: true }); }
}
Object.assign(E, { rotaEscola, navPrincipal: NavPrincipal, progressoAluno });
window.addEventListener('hashchange', registrarUltimo);
registrarUltimo();
})();
