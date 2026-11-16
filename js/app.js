/* ENEM Redação: renderiza o JSON de data/. Todo texto entra via textContent (nunca innerHTML com dado). */
(() => {
'use strict';

const ROUTES = ['repertorio', 'temas', 'aulas', 'modelos', 'monte'];
const TITLES = { repertorio: 'Repertório', temas: 'Temas 2026', aulas: 'Aulas', modelos: 'Modelos', monte: 'Monte' };
const ESCOLA = ['inicio', 'materias', 'agenda', 'biblioteca', 'livro', 'teste'];
const FILES = ['repertorios', 'temas', 'aulas', 'modelos'];
const EIXOS = ['Tecnologia e sociedade', 'Meio ambiente', 'Saúde e saúde mental', 'Educação e cultura',
  'Cidadania e direitos humanos', 'Inclusão e grupos vulneráveis', 'Trabalho e economia'];
const AREAS = ['filosofia', 'sociologia', 'história', 'literatura', 'cinema', 'dados', 'legislação'];
const PARTES = [
  ['Introdução', 'Apresente o tema e a tese (seu ponto de vista).'],
  ['Desenvolvimento 1', 'Um argumento, ligado a um repertório pertinente ao tema.'],
  ['Desenvolvimento 2', 'Outro argumento, com repertório e ligação clara com a tese.'],
  ['Conclusão', 'Retome a tese e feche com a proposta de intervenção: agente, ação, meio, finalidade e detalhamento.'],
];
const CHECK = [
  'Texto dissertativo-argumentativo, em prosa, sobre o tema proposto',
  'Tese clara na introdução',
  'Dois parágrafos de desenvolvimento, cada um com um argumento',
  'Repertório legitimado, pertinente ao tema e ligado ao argumento',
  'Conectivos entre parágrafos e dentro deles',
  'Norma-padrão: ortografia, acentuação, concordância, regência e pontuação',
  'Sem cópia dos textos motivadores',
  'Sem desrespeito aos direitos humanos',
  'Proposta de intervenção com agente',
  'Proposta com ação',
  'Proposta com meio ou modo',
  'Proposta com finalidade e detalhamento',
];
const PENDENTE = 'a verificar na cartilha do INEP';
const SEM_DESKTOP = '(min-width: 64em)';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('enem:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('enem:' + k, JSON.stringify(v)); } catch { /* sem storage: segue sem salvar */ } },
};

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#i-' + name); s.append(u);
  return s;
}
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');

/* feedback */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2000);
}
async function copiar(texto, btn, msg) {
  try { await navigator.clipboard.writeText(texto); } catch { toast('Não foi possível copiar. Selecione o texto e copie manualmente.'); return; }
  btn._orig ||= [...btn.childNodes].map((n) => n.cloneNode(true));
  btn.replaceChildren('Copiado'); toast(msg);
  clearTimeout(btn._t);
  btn._t = setTimeout(() => btn.replaceChildren(...btn._orig.map((n) => n.cloneNode(true))), 2000);
}
function extLink(url, texto) {
  return h('a', { class: 'ext', href: url, target: '_blank', rel: 'noopener noreferrer' }, texto, ' ', icon('arrow-square-out'), h('span', { class: 'sr-only' }, ' (abre em nova aba)'));
}

/* dados e estados */
const D = {};
let loaded = false;
function skeleton(el) {
  el.setAttribute('aria-busy', 'true');
  el.replaceChildren(h('div', { class: 'grid' }, h('div', { class: 'skel' }), h('div', { class: 'skel' }), h('div', { class: 'skel' })));
}
function erroEstado(el, retry = carregar) {
  const file = location.protocol === 'file:';
  el.removeAttribute('aria-busy');
  el.replaceChildren(h('div', { class: 'state state-error', role: 'alert' },
    icon('warning'),
    h('p', {}, 'Não foi possível carregar o conteúdo. Tente de novo.'),
    file && h('p', {}, 'Esta página precisa ser aberta por um servidor local, não direto pelo arquivo. Na pasta do site, rode:'),
    file && h('code', { class: 'cmd' }, 'python -m http.server'),
    file && h('p', {}, 'Depois abra http://localhost:8000 no navegador.'),
    h('button', { type: 'button', class: 'btn', onclick: retry }, 'Tentar de novo')));
}
async function carregar() {
  const views = $$('[data-view]');
  views.forEach(skeleton);
  try {
    const r = await Promise.all(FILES.map(async (f) => {
      const res = await fetch(`data/${f}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(f + ' ' + res.status);
      return res.json();
    }));
    FILES.forEach((f, i) => { D[f] = r[i]; });
    (D.repertorios || []).forEach((x) => { x._t = norm([fonteTexto(x.fonte), x.ideia, x.comoUsar, x.frase].join(' ')); });
    loaded = true;
    feito = {};
    montar(rotaAtual());
  } catch (e) {
    loaded = false;
    views.forEach(erroEstado);
  }
}
function pronto(el) { el.removeAttribute('aria-busy'); }
function vazio(msg, rotulo, fn) {
  return h('div', { class: 'state' }, h('p', {}, msg), rotulo && h('button', { type: 'button', class: 'btn', onclick: fn }, rotulo));
}

window.ENEM = { h, $, $$, store, toast, icon, skeleton, erroEstado, pronto, vazio };

/* repertório */
const F = { eixo: null, area: null, q: '', ids: null, idsRotulo: '' };
const repById = (id) => (D.repertorios || []).find((r) => r.id === id);
function verRepertorios(ids, rotulo) {
  Object.assign(F, { eixo: null, area: null, q: '', ids: new Set(ids), idsRotulo: rotulo });
  feito.repertorio = false;
  if (location.hash === '#repertorio') montar('repertorio'); else location.hash = '#repertorio';
}
function fonteTexto(f) {
  const quando = f.ano || f.lei;
  return [f.autor, f.obra].filter(Boolean).join(', ') + (quando ? ` (${quando})` : '');
}
function cardRep(r) {
  const id = 'rep-' + r.id;
  const btn = h('button', { type: 'button', class: 'btn' }, 'Copiar frase');
  btn.addEventListener('click', () => copiar(r.frase, btn, 'Frase copiada'));
  return h('article', { class: 'card', id },
    h('p', { class: 'meta' }, `${cap(r.area)} · ${r.eixos.join(' · ')}`),
    h('h2', { class: 'fonte' }, fonteTexto(r.fonte)),
    r.verificarFonte && h('p', {}, h('span', { class: 'tag tag-warn' }, icon('warning'), 'verificar fonte')),
    h('p', {}, r.ideia),
    h('details', {}, h('summary', {}, 'Ver como usar'),
      h('div', { class: 'det-body' },
        h('h3', {}, 'Como usar'), h('p', {}, r.comoUsar),
        h('h3', {}, 'Exemplo de frase'), h('blockquote', { class: 'exemplo' }, r.frase),
        h('div', { class: 'row' }, btn, isHttps(r.url) && extLink(r.url, 'Fonte')))));
}
function chips(rotulo, lista, atual, on) {
  let cur = atual;
  const bs = lista.map((v) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(atual === v), onclick: () => {
    cur = cur === v ? null : v;
    bs.forEach((b, i) => b.setAttribute('aria-pressed', String(cur === lista[i])));
    on(cur);
  } }, cap(String(v))));
  return h('div', { class: 'chips', role: 'group', 'aria-label': rotulo },
    h('span', { class: 'chips-label', 'aria-hidden': 'true' }, rotulo), bs);
}
function renderRepertorio() {
  const el = $('[data-view="repertorio"]');
  pronto(el);
  const limpar = () => { Object.assign(F, { eixo: null, area: null, q: '', ids: null, idsRotulo: '' }); renderRepertorio(); };
  const busca = h('input', { type: 'search', id: 'busca', value: F.q, 'aria-label': 'Buscar repertório', placeholder: 'Buscar por autor, obra ou ideia' });
  const count = h('p', { class: 'count' });
  const lista = h('div', { class: 'grid' });
  const solta = () => { F.ids = null; if (idsRow) idsRow.remove(); };
  const idsRow = F.ids && h('div', { class: 'row' }, h('span', { class: 'tag' }, F.idsRotulo || 'Repertórios ligados'), h('button', { type: 'button', class: 'btn', onclick: limpar }, 'Limpar filtros'));
  const filtros = h('div', { class: 'filters' },
    chips('Eixo', EIXOS, F.eixo, (v) => { F.eixo = v; solta(); aplicar(); }),
    chips('Área', AREAS, F.area, (v) => { F.area = v; solta(); aplicar(); }),
    busca, count, idsRow);
  const aplicar = () => {
    const q = norm(F.q.trim());
    const res = D.repertorios.filter((r) =>
      (!F.ids || F.ids.has(r.id)) && (!F.eixo || r.eixos.includes(F.eixo)) && (!F.area || r.area === F.area) &&
      (!q || r._t.includes(q)));
    const txt = plural(res.length, 'repertório', 'repertórios');
    count.textContent = txt; $('#live').textContent = txt;
    lista.replaceChildren(...(res.length ? res.map(cardRep) : [vazio('Nenhum repertório com esses filtros.', 'Limpar filtros', limpar)]));
    if (!res.length) lista.className = '';
    else lista.className = 'grid';
  };
  let bt;
  busca.addEventListener('input', () => { F.q = busca.value; clearTimeout(bt); bt = setTimeout(aplicar, 150); });
  el.replaceChildren(filtros, lista);
  aplicar();
}

/* temas */
const SELO = { Alta: ['check', 'tag-ok'], 'Média': ['warning', 'tag-warn'], Baixa: ['lightbulb', ''] };
function selo(p) {
  const [ic, cls] = SELO[p] || ['warning', ''];
  return h('span', { class: 'tag ' + cls }, icon(ic), 'Probabilidade: ' + p);
}
function renderTemas() {
  const el = $('[data-view="temas"]');
  pronto(el);
  const t = D.temas;
  const out = [h('p', { class: 'aviso' }, icon('warning'), ' ', t.aviso)];
  if (t.datas) {
    out.push(h('div', { class: 'card', style: null },
      h('h2', {}, 'Datas da prova'),
      h('p', {}, t.datas.texto, ' ', h('span', { class: 'tag tag-warn' }, t.datas.status)),
      (t.datas.fontes || []).filter(isHttps).length > 0 && h('ul', { class: 'list-clean' }, t.datas.fontes.filter(isHttps).map((u) => h('li', {}, extLink(u, 'Fonte'))))));
  }
  const prev = t.previsoes || [];
  out.push(...(prev.length ? [h('div', { class: 'list' }, prev.map((p) => {
    const ids = (p.repertorios || []).filter(repById);
    return h('article', { class: 'card' },
      h('h2', {}, p.tema),
      h('p', {}, selo(p.prob)),
      h('p', { class: 'prose' }, p.justificativa),
      (p.fontes || []).filter(isHttps).length > 0 && h('ul', { class: 'list-clean' }, p.fontes.filter(isHttps).map((u) => h('li', {}, extLink(u, 'Fonte')))),
      ids.length > 0 && h('button', { type: 'button', class: 'btn', onclick: () => verRepertorios(ids, 'Repertórios do tema: ' + p.tema) }, 'Ver repertórios'));
  }))] : [vazio('Nenhum tema previsto no momento.')]));
  const ant = t.anteriores || [];
  if (ant.length) {
    out.push(h('details', { class: 'card' }, h('summary', {}, 'Temas anteriores'),
      h('div', { class: 'det-body' }, h('ul', {}, ant.map((a) => h('li', {}, `${a.ano}: ${a.tema} `, h('span', { class: 'muted' }, `(${a.status})`)))))));
  }
  el.replaceChildren(...out);
}

/* aulas */
let aulaIdx = 0;
function renderAulas() {
  const el = $('[data-view="aulas"]');
  pronto(el);
  const L = D.aulas;
  if (!L.length) { el.replaceChildren(vazio('Nenhuma aula disponível ainda.')); return; }
  const sel = (i) => { aulaIdx = i; renderAulas(); const t = $('#aula-titulo'); if (t) t.focus(); };
  const a = L[aulaIdx];
  const mq = matchMedia(SEM_DESKTOP);
  const box = h('details', { class: 'sumario-box' }, h('summary', {}, 'Lições'),
    h('ul', {}, L.map((x, i) => h('li', {}, h('a', { href: '#aulas', 'aria-current': String(i === aulaIdx), onclick: (e) => { e.preventDefault(); sel(i); } }, x.titulo)))));
  box.open = mq.matches;
  const proxima = h('button', { type: 'button', class: 'btn btn-primary', 'aria-disabled': String(aulaIdx >= L.length - 1), onclick: () => { if (aulaIdx < L.length - 1) sel(aulaIdx + 1); } }, 'Próxima lição');
  const corpo = h('article', { class: 'prose' },
    h('h2', { id: 'aula-titulo', tabindex: '-1' }, a.titulo),
    a.competencia && h('p', {}, h('span', { class: 'tag' }, 'Competência ' + a.competencia.replace(/^C/, ''))),
    (a.blocos || []).map((b) => h('div', { class: 'bloco' },
      h('h3', {}, b.rotulo),
      b.texto && h('p', {}, b.texto),
      b.itens && h('ul', {}, b.itens.map((i) => h('li', {}, i))),
      b.status && h('p', {}, h('span', { class: 'tag tag-warn' }, icon('warning'), b.status)))),
    (a.fontes || []).filter(isHttps).length > 0 && h('div', { class: 'bloco' }, h('h3', {}, 'Fontes'), h('ul', { class: 'list-clean' }, a.fontes.filter(isHttps).map((u) => h('li', {}, extLink(u, u))))),
    proxima);
  el.replaceChildren(h('div', { class: 'aulas-wrap' }, h('nav', { class: 'sumario', 'aria-label': 'Sumário das aulas' }, box), corpo));
}

/* modelos */
let anoSel = null;
function painelAnalise(m) {
  const an = m.analise;
  if (!an) return h('details', {}, h('summary', {}, 'Ver análise'), h('div', { class: 'det-body' }, h('p', { class: 'pending' }, 'Análise ainda não disponível.')));
  const pend = () => h('p', { class: 'pending' }, PENDENTE);
  const campo = (rot, val) => h('p', {}, h('strong', {}, rot + ': '), val);
  const abas = [
    ['Estrutura', () => an ? h('ol', {}, (an.estrutura || []).map((x) => h('li', {}, x))) : pend()],
    ['Tese, argumentos e proposta', () => an ? h('div', {},
      campo('Tese', an.tese), h('h4', {}, 'Argumentos'), h('ul', {}, (an.argumentos || []).map((x) => h('li', {}, x))),
      h('h4', {}, 'Proposta'),
      ['agente', 'acao', 'meio', 'finalidade', 'detalhamento'].map((k) => campo(cap(k === 'acao' ? 'ação' : k), an.proposta && an.proposta[k] || ''))) : pend()],
    ['Repertório usado', () => an ? ((an.repertorioIds || []).filter(repById).length
      ? h('ul', { class: 'list-clean' }, an.repertorioIds.filter(repById).map((id) => h('li', {}, h('a', { href: '#repertorio', onclick: (e) => { e.preventDefault(); verRepertorios([id], 'Repertório da redação ' + m.ano); } }, fonteTexto(repById(id).fonte)))))
      : h('p', { class: 'pending' }, 'Nenhum repertório ligado.')) : pend()],
    ['Competências', () => an ? h('ul', {}, ['C1', 'C2', 'C3', 'C4', 'C5'].map((c) => h('li', {}, h('strong', {}, c + ': '), (an.competencias || {})[c] || ''))) : pend()],
  ];
  const uid = 'an-' + m.ano;
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Análise da redação ' + m.ano });
  const painel = h('div', { id: uid + '-p', role: 'tabpanel', tabindex: '0' });
  const botoes = abas.map(([nome, fn], i) => {
    const b = h('button', { type: 'button', class: 'tab', role: 'tab', id: `${uid}-t${i}`, 'aria-controls': uid + '-p', onclick: () => ativa(i) }, nome);
    return b;
  });
  const ativa = (i, foco) => {
    botoes.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
    painel.setAttribute('aria-labelledby', `${uid}-t${i}`);
    painel.replaceChildren(abas[i][1]());
    if (foco) botoes[i].focus();
  };
  tabs.addEventListener('keydown', (e) => {
    const i = botoes.indexOf(document.activeElement);
    if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    ativa((i + (e.key === 'ArrowRight' ? 1 : -1) + botoes.length) % botoes.length, true);
  });
  tabs.append(...botoes);
  ativa(0);
  return h('details', {}, h('summary', {}, 'Ver análise'), h('div', { class: 'det-body' }, tabs, painel));
}
function cardModelo(m) {
  return h('article', { class: 'card' },
    h('h2', {}, `${m.ano} · ${m.tema}`),
    m.provaOrigem && h('p', { class: 'meta' }, m.provaOrigem),
    m.fonteUrl && isHttps(m.fonteUrl)
      ? h('p', {}, extLink(m.fonteUrl, 'Fonte oficial (INEP)'), ' ', h('span', { class: 'tag tag-warn' }, m.status || PENDENTE))
      : h('p', {}, 'Redações oficiais do INEP: conferir na Cartilha do Participante. ', extLink('https://www.gov.br/inep', 'Site do INEP')),
    (m.trechos || []).map((t) => h('div', {}, h('blockquote', {}, t.texto), t.nota && h('p', { class: 'meta' }, t.nota), isHttps(t.url) && h('p', {}, extLink(t.url, 'Ler a redação completa na fonte')))),
    painelAnalise(m));
}
function renderModelos() {
  const el = $('[data-view="modelos"]');
  pronto(el);
  const M = D.modelos;
  const anos = [...new Set(M.map((m) => m.ano))].sort((a, b) => b - a);
  const lista = h('div');
  const pinta = () => {
    const res = M.filter((m) => !anoSel || m.ano === anoSel);
    lista.replaceChildren(res.length ? h('div', { class: 'list' }, res.map(cardModelo)) : vazio('Nenhuma redação desse ano ainda.'));
  };
  el.replaceChildren(h('div', { class: 'filters' }, chips('Ano', anos, anoSel, (v) => { anoSel = v; pinta(); })), lista);
  pinta();
}

/* monte */
let escMonte, salvaT, salvaPend;
function flushSalva() { clearTimeout(salvaT); if (salvaPend) { salvaPend(); salvaPend = null; } }
function renderMonte() {
  const el = $('[data-view="monte"]');
  pronto(el);
  const r0 = store.get('rascunho', []), c0 = store.get('check', []);
  const rascunho = Array.isArray(r0) ? r0.map((x) => (typeof x === 'string' ? x : '')) : [];
  const marcados = Array.isArray(c0) ? c0 : [];
  const areas = PARTES.map(([rot, dica], i) => {
    const id = 'parte-' + i, wc = h('p', { class: 'wc', 'aria-live': 'off' });
    const ta = h('textarea', { id, rows: '6', 'aria-describedby': `${id}-d` });
    ta.value = rascunho[i] || '';
    const conta = () => { const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; wc.textContent = plural(n, 'palavra', 'palavras'); };
    ta.addEventListener('input', () => {
      conta();
      salvaPend = () => store.set('rascunho', PARTES.map((_, j) => $('#parte-' + j).value));
      clearTimeout(salvaT); salvaT = setTimeout(flushSalva, 400);
    });
    conta();
    return { ta, node: h('div', { class: 'editor' }, h('label', { for: id }, rot), h('p', { class: 'dica', id: id + '-d' }, dica), ta, wc) };
  });
  const prog = h('progress', { max: String(CHECK.length), value: '0', 'aria-label': 'Itens marcados' });
  const n = h('p', { 'aria-live': 'polite' });
  const caixas = CHECK.map((t, i) => {
    const c = h('input', { type: 'checkbox', id: 'chk-' + i });
    c.checked = marcados.includes(i);
    c.addEventListener('change', atualiza);
    return { c, li: h('li', {}, h('label', { for: 'chk-' + i }, c, h('span', {}, t))) };
  });
  function atualiza() {
    const m = caixas.flatMap((x, i) => (x.c.checked ? [i] : []));
    store.set('check', m);
    n.textContent = `${m.length} de ${CHECK.length}`;
    prog.value = m.length;
  }
  const btnCopiar = h('button', { type: 'button', class: 'btn btn-primary' }, icon('copy'), 'Copiar redação');
  btnCopiar.addEventListener('click', () => {
    const txt = areas.map((a) => a.ta.value.trim()).filter(Boolean).join('\n\n');
    if (!txt) { toast('Escreva algo antes de copiar'); return; }
    copiar(txt, btnCopiar, 'Redação copiada');
  });
  const side = h('aside', { class: 'side panel', id: 'checklist', 'aria-label': 'Checklist das competências' },
    h('div', { class: 'drawer-head' }, h('h2', {}, 'Checklist'), h('button', { type: 'button', class: 'btn drawer-close', 'aria-label': 'Fechar checklist', onclick: () => fecha() }, icon('x'))),
    n, prog, h('ul', { class: 'checklist' }, caixas.map((x) => x.li)));
  const gatilho = h('button', { type: 'button', class: 'btn drawer-btn', 'aria-expanded': 'false', 'aria-controls': 'checklist' }, icon('check'), 'Checklist');
  function fecha() { side.classList.remove('open'); gatilho.setAttribute('aria-expanded', 'false'); gatilho.focus(); }
  gatilho.addEventListener('click', () => {
    const abre = !side.classList.contains('open');
    side.classList.toggle('open', abre); gatilho.setAttribute('aria-expanded', String(abre));
    if (abre) $('.drawer-close', side).focus();
  });
  escMonte = () => { if (side.classList.contains('open') && side.isConnected) fecha(); };
  atualiza();
  el.replaceChildren(h('div', { class: 'monte-wrap' }, h('div', {}, areas.map((a) => a.node), btnCopiar), side), gatilho);
}

/* tema claro/escuro */
function temaAtual() {
  const t = document.documentElement.dataset.theme;
  return t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function aplicaTema(t) {
  if (t) document.documentElement.dataset.theme = t;
  const b = $('#theme-toggle'), esc = temaAtual() === 'dark';
  b.replaceChildren(icon(esc ? 'sun' : 'moon'), h('span', { class: 'lbl-theme' }, esc ? 'Claro' : 'Escuro'));
  b.setAttribute('aria-label', esc ? 'Mudar para tema claro' : 'Mudar para tema escuro');
}

/* roteador */
const RENDER = { repertorio: renderRepertorio, temas: renderTemas, aulas: renderAulas, modelos: renderModelos, monte: renderMonte };
let feito = {};
function montar(r) { if (loaded && !feito[r]) { RENDER[r](); feito[r] = true; } }
const rotaAtual = () => (ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'repertorio');
let primeira = true, carregando = false;
function rota() {
  if (location.hash === '#main' && !primeira) { $('#main').focus(); return; }
  if (!location.hash) { try { history.replaceState(null, '', '#inicio'); } catch { location.hash = '#inicio'; return; } }
  const E = window.ENEM, seg = location.hash.slice(1).split('/')[0];
  const esc = ESCOLA.includes(seg);
  const slug = !esc && (seg === 'mat' || Object.values(E.materias || {}).some((m) => m.slug === seg)) ? seg : null;
  document.body.dataset.area = esc ? 'escola' : slug ? 'mat' : 'red';
  if (E.navPrincipal) E.navPrincipal(esc ? seg : 'materias');
  $$('section[data-escola]').forEach((s) => { s.hidden = true; });
  if (esc || slug) {
    ROUTES.forEach((x) => { $(`section[data-route="${x}"]`).hidden = true; });
    if (esc) { $('#mat').hidden = true; if (E.rotaEscola) E.rotaEscola(seg, primeira); }
    else if (E.rotaMat) E.rotaMat(primeira, slug);
    primeira = false;
    return;
  }
  $('#mat').hidden = true;
  if (!carregando) { carregando = true; carregar(); }
  const r = rotaAtual();
  ROUTES.forEach((x) => { $(`section[data-route="${x}"]`).hidden = x !== r; });
  $$('.nav a').forEach((a) => { if (a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = `${TITLES[r]} · ENEM Redação`;
  montar(r);
  if (!primeira) { window.scrollTo(0, 0); $(`#h-${r}`).focus({ preventScroll: true }); }
  primeira = false;
}

document.addEventListener('DOMContentLoaded', () => {
  aplicaTema(store.get('theme', null));
  $('#theme-toggle').addEventListener('click', () => {
    const t = temaAtual() === 'dark' ? 'light' : 'dark';
    store.set('theme', t); aplicaTema(t);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicaTema());
  matchMedia(SEM_DESKTOP).addEventListener('change', (e) => { const b = $('.sumario-box'); if (b) b.open = e.matches; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && escMonte) escMonte(); });
  window.addEventListener('pagehide', flushSalva);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSalva(); });
  window.addEventListener('hashchange', rota);
  rota();
});
})();
