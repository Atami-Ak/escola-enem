/* ENEM Matemática: quadro de rascunho. Só memória (nada em storage). Traços = lista com PAPEL de cor, repintada do zero. */
'use strict';

/* ---------- funções puras (testadas em tools/mat_test.js) ---------- */
const PAPEIS = { text: '--text', accent: '--accent', danger: '--danger', ok: '--ok', warn: '--warn' };
const NOMES = { text: 'preta', accent: 'verde', danger: 'vermelha', ok: 'azul-verde', warn: 'âmbar' };
const LARGURAS = [2, 4, 8]; // espessuras do traço (unidade CSS)
const RAIO_BORRACHA = 16;
const PALMA = 40; // contato de toque maior que isto (unidade CSS) é palma
const MAX_HIST = 100; // passos de desfazer guardados
const MIN_DIST = 0.002; // ponto mais perto que isto do anterior é descartado (coords normalizadas)

/** Estado vazio de um quadro. */
const q0 = () => ({ tracos: [], hist: [], refazer: [] });
/** Troca a lista de traços empilhando a antiga no histórico; zera o refazer. Serve a traço, borracha e limpar. */
function empilha(q, ant) { q.hist.push(ant); if (q.hist.length > MAX_HIST) q.hist.shift(); }
function commit(q, novos) { empilha(q, q.tracos); q.tracos = novos; q.refazer = []; return q; }
function desfazer(q) {
  if (!q.hist.length) return q;
  q.refazer.push(q.tracos); q.tracos = q.hist.pop(); return q;
}
function refazer(q) {
  if (!q.refazer.length) return q;
  q.hist.push(q.tracos); q.tracos = q.refazer.pop(); return q;
}
/** Limpar é um commit de lista vazia: desfazer restaura o quadro inteiro. */
function limpar(q) { return q.tracos.length ? commit(q, []) : q; }

/** O aviso "Quadro limpo. Desfazer" só vale enquanto o quadro está exatamente como a limpeza o deixou (qualquer traço, desfazer ou refazer troca a lista). */
const avisoValido = (q, marca) => marca !== null && q.tracos === marca;

/** Distância do ponto (x,y) ao segmento a-b. */
function distSeg(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}
/** Borracha de traço: remove todo traço com algum segmento a menos de r do ponto. Devolve a MESMA lista se nada foi atingido. */
function apagaEm(tracos, x, y, r) {
  const fica = tracos.filter((t) => !t.pts.some((p, i) => distSeg(x, y, p, t.pts[i + 1] || p) <= r));
  return fica.length === tracos.length ? tracos : fica;
}
/** Fim do gesto da borracha: se a lista mudou, o estado anterior vira um passo do histórico. */
function fimApaga(q, ant) {
  if (q.tracos !== ant) { empilha(q, ant); q.refazer = []; }
  return q;
}
/** Papel -> cor, lendo a var CSS por `ler` (getComputedStyle no navegador). Papel desconhecido cai em text. */
function corDe(papel, ler) { return String(ler(PAPEIS[papel] || PAPEIS.text) || '').trim(); }
/** Rejeição de palma: toque é ignorado se já se viu caneta ou se o contato é grande. */
function ignorar(tipo, w, h, penVisto) { return tipo === 'touch' && (penVisto || Math.max(w || 0, h || 0) > PALMA); }

/** Registro por chave: obter cria ou reusa; entre inicio() e fim(), chave não pedida é destruída. */
function criarRegistro(criar, destruir) {
  const mapa = new Map();
  let usadas = null;
  return {
    mapa,
    inicio() { usadas = new Set(); },
    obter(chave) {
      if (usadas) usadas.add(chave);
      if (!mapa.has(chave)) mapa.set(chave, criar(chave));
      return mapa.get(chave);
    },
    fim() {
      if (!usadas) return;
      for (const [k, v] of [...mapa]) if (!usadas.has(k)) { destruir(v); mapa.delete(k); }
      usadas = null;
    },
  };
}

if (typeof module !== 'undefined') module.exports = { q0, commit, desfazer, refazer, limpar, apagaEm, fimApaga, distSeg, corDe, ignorar, criarRegistro, avisoValido, PAPEIS, LARGURAS, MAX_HIST };

/* ---------- interface ---------- */
if (typeof document !== 'undefined' && window.ENEM) (() => {
const { h, icon } = window.ENEM;

let penVisto = false; // vale para a sessão inteira
const instancias = new Set();

/** Repinta todos os quadros (tema claro/escuro, manual ou do sistema). */
function repintaTudo() { instancias.forEach((i) => i.redesenha()); }
let observando = false;
function observaTema() {
  if (observando) return;
  observando = true;
  new MutationObserver(repintaTudo).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mq) mq.addEventListener('change', repintaTudo);
}

/** Desenha o trecho de um traço a partir do ponto `de`; ponto único vira bolinha. */
function trecho(ctx, cor, w, pts, de) {
  ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x * ctx.W, pts[0].y * ctx.W, w / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(pts[de].x * ctx.W, pts[de].y * ctx.W);
  for (let i = de + 1; i < pts.length; i++) ctx.lineTo(pts[i].x * ctx.W, pts[i].y * ctx.W);
  ctx.stroke();
}

function criar() {
  const q = q0();
  const s = { papel: 'text', w: LARGURAS[1], borracha: false, grade: false, ativo: null, apagando: false, atual: null, ant: null, feito: 0, pintado: null, marcaLimpa: null };
  const canvas = h('canvas', {
    class: 'quadro-tela', tabindex: '0', role: 'img', 'aria-label': 'Quadro de rascunho (desenho com toque ou mouse)',
    'aria-describedby': '', width: '1', height: '1',
  });
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!window.PointerEvent || !ctx) {
    return { no: h('p', { class: 'aviso' }, 'Seu navegador não suporta o quadro. Use papel.'), redesenha() {}, destroi() {} };
  }
  const uid = 'q' + Math.random().toString(36).slice(2, 8);
  const ajuda = h('span', { id: uid + '-a', class: 'sr-only' }, 'Opcional. Não há como responder aqui; digite a resposta no campo.');
  canvas.setAttribute('aria-describedby', uid + '-a');
  const dica = h('p', { class: 'quadro-dica' }, 'Risque aqui. Seu rascunho some ao sair da questão.');
  const palmaDica = h('p', { class: 'quadro-dica quadro-palma', hidden: true }, 'Com caneta, a palma não risca.');
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const aviso = h('div', { class: 'state quadro-aviso', hidden: true });
  let avisoT;
  const diz = (t) => { live.textContent = t; };

  /* ---- desenho ---- */
  const ler = (v) => getComputedStyle(canvas).getPropertyValue(v);
  const cor = (p) => corDe(p, ler);
  /** As 5 cores de papel lidas uma vez (uma leitura de estilo por repintura, não por traço). */
  const cores = () => { const cs = getComputedStyle(canvas), o = {}; for (const p in PAPEIS) o[p] = corDe(p, (v) => cs.getPropertyValue(v)); return o; };
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const encolhe = () => { if (canvas.width > 1 || canvas.height > 1) { canvas.width = 1; canvas.height = 1; } }; // oculto/destruído: libera o backing store
  function mede() {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) { encolhe(); return false; }
    const d = dpr();
    if (canvas.width !== Math.round(W * d) || canvas.height !== Math.round(H * d)) { canvas.width = Math.round(W * d); canvas.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.W = W; ctx.H = H;
    return true;
  }
  function redesenha() {
    if (!mede()) return;
    ctx.clearRect(0, 0, ctx.W, ctx.H);
    const cs = cores(), c = (p) => cs[p] || cs.text;
    q.tracos.forEach((t) => trecho(ctx, c(t.papel), t.w, t.pts, 0));
    if (s.atual) trecho(ctx, c(s.atual.papel), s.atual.w, s.atual.pts, 0);
    s.pintado = q.tracos;
    s.feito = s.atual ? s.atual.pts.length : 0;
    sync();
  }
  let rafId = 0;
  function agenda() { if (!rafId) rafId = requestAnimationFrame(quadro); }
  function quadro() { // um repaint por frame: só o segmento novo
    rafId = 0;
    if (s.apagando) { if (q.tracos !== s.pintado) redesenha(); return; } // borracha: só repinta se a lista mudou
    if (!s.atual) { redesenha(); return; }
    if (!mede()) return;
    const p = s.atual.pts;
    if (p.length > s.feito) { trecho(ctx, cor(s.atual.papel), s.atual.w, p, Math.max(0, s.feito - 1)); s.feito = p.length; }
    sync();
  }

  /* ---- ponteiro ---- */
  const ponto = (e, r) => { r = r || canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.width }; };
  const apaga = (p) => { q.tracos = apagaEm(q.tracos, p.x, p.y, RAIO_BORRACHA / (ctx.W || 1)); };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') { penVisto = true; palmaDica.hidden = false; }
    if (s.ativo !== null && !canvas.hasPointerCapture(s.ativo)) fim({ pointerId: s.ativo }); // captura perdida (mostrar(), aba oculta): encerra o gesto preso
    if (ignorar(e.pointerType, e.width, e.height, penVisto) || s.ativo !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ponteiro sintético/inativo: o traço começa mesmo assim */ }
    s.ativo = e.pointerId; s.apagando = s.borracha; // ferramenta congelada no início do gesto
    const p = ponto(e);
    if (s.apagando) { s.ant = q.tracos; apaga(p); } else s.atual = { papel: s.papel, w: s.w, pts: [p] };
    agenda();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== s.ativo) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [], r = canvas.getBoundingClientRect();
    (evs.length ? evs : [e]).forEach((c) => {
      const p = ponto(c, r);
      if (s.apagando) { apaga(p); return; }
      if (!s.atual) return;
      const u = s.atual.pts[s.atual.pts.length - 1];
      if (Math.hypot(p.x - u.x, p.y - u.y) >= MIN_DIST) s.atual.pts.push(p);
    });
    agenda();
  });
  function fim(e) {
    if (e.pointerId !== s.ativo) return;
    s.ativo = null; s.apagando = false;
    if (s.atual) { commit(q, [...q.tracos, s.atual]); s.atual = null; }
    if (s.ant) { fimApaga(q, s.ant); s.ant = null; }
    redesenha();
  }
  canvas.addEventListener('pointerup', fim);
  canvas.addEventListener('pointercancel', fim);
  canvas.addEventListener('lostpointercapture', fim);

  /* ---- ações ---- */
  const pode = { desfaz: () => q.hist.length > 0, refaz: () => q.refazer.length > 0, limpa: () => q.tracos.length > 0 };
  function desfaz() { if (pode.desfaz()) { desfazer(q); redesenha(); diz('Traço desfeito'); } }
  function refaz() { if (pode.refaz()) { refazer(q); redesenha(); diz('Traço refeito'); } }
  function limpa() {
    if (!pode.limpa()) return;
    limpar(q); s.marcaLimpa = q.tracos; redesenha(); diz('Quadro limpo');
    aviso.replaceChildren(h('span', null, 'Quadro limpo. '), h('button', { type: 'button', class: 'btn', onclick: () => { if (avisoValido(q, s.marcaLimpa)) desfaz(); aviso.hidden = true; } }, 'Desfazer'));
    aviso.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => { aviso.hidden = true; }, 6000);
  }
  function baixa() {
    if (!mede()) return;
    const c = document.createElement('canvas'), d = dpr();
    c.width = Math.round(ctx.W * d); c.height = Math.round(ctx.H * d);
    const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.W = ctx.W;
    x.fillStyle = ler('--surface'); x.fillRect(0, 0, ctx.W, ctx.H);
    const cs = cores();
    q.tracos.forEach((t) => trecho(x, cs[t.papel] || cs.text, t.w, t.pts, 0));
    c.toBlob((b) => {
      if (!b) return;
      const u = URL.createObjectURL(b), a = h('a', { href: u, download: 'rascunho.png' });
      a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); diz('Baixado');
    });
  }
  const raiz = h('div', { class: 'q-quadro-no', 'data-expandido': 'false' });
  function expande() {
    const e = raiz.dataset.expandido !== 'true';
    raiz.dataset.expandido = String(e);
    if (e) { raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-label', 'Quadro de rascunho'); raiz.setAttribute('aria-modal', 'true'); }
    else { raiz.removeAttribute('role'); raiz.removeAttribute('aria-label'); raiz.removeAttribute('aria-modal'); }
    bExp.replaceChildren(icon(e ? 'arrows-in' : 'arrows-out'));
    bExp.setAttribute('aria-pressed', String(e)); // rótulo fixo "Expandir quadro" + aria-pressed
    bExp.focus(); // entra no painel ao expandir, volta ao botão ao recolher
  }

  /* ---- barra ---- */
  const botoes = [];
  const bt = (rotulo, ic, fn, extra) => {
    const b = h('button', { type: 'button', class: 'btn quadro-btn', 'aria-label': rotulo, tabindex: botoes.length ? '-1' : '0', onclick: fn, ...extra }, icon(ic));
    botoes.push(b); return b;
  };
  const grupoW = LARGURAS.map((w, i) => bt(`Caneta ${['fina', 'média', 'grossa'][i]}`, 'pencil-simple', () => { s.w = w; s.borracha = false; sync(); }, { 'data-w': w }));
  grupoW.forEach((b) => b.append(h('span', { class: 'quadro-ponto', 'aria-hidden': 'true' })));
  const bBor = bt('Borracha (apaga o traço inteiro)', 'eraser', () => { s.borracha = !s.borracha; sync(); });
  const bCores = Object.keys(PAPEIS).map((p) => {
    const b = h('button', { type: 'button', class: 'quadro-cor', 'data-papel': p, 'aria-label': `Tinta ${NOMES[p]}`, tabindex: '-1', onclick: () => { s.papel = p; s.borracha = false; sync(); } });
    botoes.push(b); return b;
  });
  const bDes = bt('Desfazer', 'arrow-u-up-left', desfaz);
  const bRef = bt('Refazer', 'arrow-u-up-right', refaz);
  const bLim = bt('Limpar quadro', 'trash', limpa);
  const bGrade = bt('Grade', 'grid-four', () => { s.grade = !s.grade; sync(); });
  const bExp = bt('Expandir quadro', 'arrows-out', expande, { 'aria-pressed': 'false' });
  const bPng = bt('Baixar PNG', 'download-simple', baixa);
  const mq = window.matchMedia && window.matchMedia('(min-width: 48em)');
  const png = () => { bPng.hidden = !(mq && mq.matches); };
  png(); if (mq) mq.addEventListener('change', png);
  const barra = h('div', { class: 'quadro-barra', role: 'toolbar', 'aria-label': 'Ferramentas do quadro' }, botoes);
  barra.addEventListener('keydown', (e) => { // roving tabindex
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const vis = botoes.filter((b) => !b.hidden), i = vis.indexOf(document.activeElement);
    if (k === undefined || i < 0) { if (e.key === 'Home' && vis[0]) { e.preventDefault(); vis[0].focus(); } return; }
    e.preventDefault();
    const n = vis[(i + k + vis.length) % vis.length];
    botoes.forEach((b) => { b.tabIndex = b === n ? 0 : -1; }); n.focus();
  });
  barra.addEventListener('focusin', (e) => { if (botoes.includes(e.target)) botoes.forEach((b) => { b.tabIndex = b === e.target ? 0 : -1; }); });

  /** Reflete o estado nos botões e na dica. */
  function sync() {
    grupoW.forEach((b) => b.setAttribute('aria-pressed', String(!s.borracha && +b.dataset.w === s.w)));
    bBor.setAttribute('aria-pressed', String(s.borracha));
    bCores.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.papel === s.papel)));
    bGrade.setAttribute('aria-pressed', String(s.grade));
    if (s.grade) canvas.dataset.grade = ''; else delete canvas.dataset.grade;
    bDes.setAttribute('aria-disabled', String(!pode.desfaz()));
    bRef.setAttribute('aria-disabled', String(!pode.refaz()));
    bLim.setAttribute('aria-disabled', String(!pode.limpa()));
    dica.hidden = q.tracos.length > 0 || !!s.atual;
    if (!aviso.hidden && !avisoValido(q, s.marcaLimpa)) aviso.hidden = true; // novo traço, desfazer ou refazer invalida o aviso
  }

  canvas.addEventListener('keydown', (e) => { // Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfaz(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); refaz(); }
  });
  raiz.addEventListener('keydown', (e) => {
    if (raiz.dataset.expandido !== 'true') return;
    if (e.key === 'Escape') { e.preventDefault(); expande(); return; }
    if (e.key !== 'Tab') return; // trap: Tab/Shift+Tab circulam dentro do painel expandido
    const f = [...raiz.querySelectorAll('button, [tabindex]')].filter((el) => el.tabIndex >= 0 && !el.hidden && !el.closest('[hidden]'));
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  });
  raiz.append(barra, h('div', { class: 'quadro-folha' }, canvas, dica, palmaDica), aviso, live, ajuda);

  const ro = new ResizeObserver(redesenha);
  ro.observe(canvas);
  const inst = { no: raiz, redesenha, destroi() { ro.disconnect(); instancias.delete(inst); clearTimeout(avisoT); cancelAnimationFrame(rafId); encolhe(); if (mq) mq.removeEventListener('change', png); } };
  instancias.add(inst);
  sync();
  return inst;
}

const reg = criarRegistro(criar, (i) => i.destroi());
observaTema();
window.ENEM.quadro = {
  inicio: () => reg.inicio(),
  fim: () => reg.fim(),
  /** Nó do quadro da questão `chave`: cria ou reusa (o canvas sobrevive aos rebuilds de mostrar()). */
  obter: (chave) => reg.obter(chave).no,
  /** false sem PointerEvent/canvas 2d: o botão Rascunho some e sobra a nota "Use papel". */
  suporta: () => !!window.PointerEvent && !!document.createElement('canvas').getContext('2d'),
};
})();
