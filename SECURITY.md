# Segurança

Este site não tem login, nem servidor, nem dado sensível. O nome (até 24 caracteres) e o progresso ficam só no `localStorage` deste navegador.

## O que está protegido
- XSS por dados ou JSON: o código não usa `innerHTML` (tudo por `h()` e `textContent`) e o `index.html` tem uma CSP restritiva (`default-src 'none'`, scripts e estilos só do próprio site). `python tools/check.py` falha se aparecer `innerHTML`, `eval`, estilo ou script inline.
- Armazenamento adulterado: `js/dados.js` valida o que lê do `localStorage`; valor quebrado ou fora do formato cai no padrão e a tela não quebra.
- Links externos abrem com `rel="noopener noreferrer"` (sem acesso ao `window.opener` e sem referrer).
- Segredos: nenhum no repositório; `.env*`, `*.pem` e `*.key` estão no `.gitignore`.

## O que NÃO está protegido
- Quem usa o aparelho lê e edita tudo no `localStorage`.
- XP, nível e sequência podem ser falsificados no próprio navegador.
- Clickjacking e relatórios de violação: a meta-CSP não aceita `frame-ancestors`, `report-uri` nem `sandbox`, e o GitHub Pages não permite definir cabeçalhos HTTP (lá só vale a meta CSP). Na hospedagem Cloudflare (`wrangler.jsonc`) seria possível adicionar um arquivo `_headers` com `frame-ancestors` e outros cabeçalhos; hoje não existe. `.assetsignore` deixa `SECURITY.md`, `serve.py`, `tools/` e `.claude/` fora da publicação.
- Extensões do navegador que leem ou alteram a página.

## Antes de ligar um banco real
- Autenticação no servidor.
- Regras e validação no servidor; nunca confiar em XP ou nota vindos do cliente (recalcular no servidor).
- LGPD: o público inclui menores de idade (consentimento, minimização de dados).
- HTTPS em todo o tráfego.
