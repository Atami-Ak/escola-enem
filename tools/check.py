"""Valida data/*.json contra os schemas de .claude/plans/enem-redacao.md e confere tokens no CSS/JS/HTML.
Uso: python tools/check.py   (stdlib; sai 1 na primeira classe de falha)"""
import ast
import itertools
import json
import math
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AREAS = {"filosofia", "sociologia", "história", "literatura", "cinema", "dados", "legislação"}
EIXOS = ["Tecnologia e sociedade", "Meio ambiente", "Saúde e saúde mental", "Educação e cultura",
         "Cidadania e direitos humanos", "Inclusão e grupos vulneráveis", "Trabalho e economia"]
PROBS = {"Alta", "Média", "Baixa"}
AVISO = "Probabilidade é estimativa editorial, não previsão oficial."
DATA_STATUS = "não confirmado"
ANT_STATUS = "título não conferido no INEP"
MOD_STATUS = "a verificar na cartilha do INEP"
COMPS = ["C1", "C2", "C3", "C4", "C5"]
PROPOSTA = ["agente", "acao", "meio", "finalidade", "detalhamento"]
NUM = re.compile(r"\d+")
ANO = re.compile(r"^(1[0-9]{3}|20[0-9]{2})$")

errs = []


def err(msg):
    errs.append(msg)


def fim(classe):
    """Imprime erros da classe e sai 1 se houver."""
    if errs:
        print(f"FALHA [{classe}]: {len(errs)} problema(s)")
        for e in errs[:20]:
            print("  -", e)
        if len(errs) > 20:
            print(f"  ... +{len(errs) - 20}")
        sys.exit(1)


def txt(v):
    return isinstance(v, str) and v.strip() != ""


def https(u):
    return isinstance(u, str) and u.startswith("https://")


def carrega(nome):
    p = ROOT / "data" / f"{nome}.json"
    if not p.exists():
        err(f"{nome}.json ausente")
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(f"{nome}.json inválido: {e}")
        return None


def ids_unicos(lista, nome):
    vistos = set()
    for x in lista:
        i = x.get("id") if isinstance(x, dict) else None
        if not txt(i):
            err(f"{nome}: item sem id")
        elif i in vistos:
            err(f"{nome}: id repetido {i}")
        vistos.add(i)
    return vistos


# 1. carga
rep, tem, aul, mod = (carrega(n) for n in ("repertorios", "temas", "aulas", "modelos"))
fim("arquivos")

# 2. schemas
if not isinstance(rep, list):
    err("repertorios.json deve ser lista")
if not isinstance(aul, list):
    err("aulas.json deve ser lista")
if not isinstance(mod, list):
    err("modelos.json deve ser lista")
if not isinstance(tem, dict):
    err("temas.json deve ser objeto")
fim("tipos")

for r in rep:
    i = r.get("id", "?")
    for k in ("ideia", "comoUsar", "frase"):
        if not txt(r.get(k)):
            err(f"repertorio {i}: {k} vazio")
    if r.get("area") not in AREAS:
        err(f"repertorio {i}: area inválida {r.get('area')!r}")
    ex = r.get("eixos")
    if not (isinstance(ex, list) and 1 <= len(ex) <= 2 and all(e in EIXOS for e in ex)):
        err(f"repertorio {i}: eixos inválidos {ex!r}")
    f = r.get("fonte")
    if not (isinstance(f, dict) and (txt(f.get("autor")) or txt(f.get("obra"))) and (f.get("ano") or f.get("lei"))):
        err(f"repertorio {i}: fonte precisa de autor/obra e ano ou lei")
    if "verificarFonte" in r and not isinstance(r["verificarFonte"], bool):
        err(f"repertorio {i}: verificarFonte deve ser bool")
    if "url" in r and not https(r["url"]):
        err(f"repertorio {i}: url não https")
    corpo = " ".join(str(r.get(k, "")) for k in ("ideia", "comoUsar", "frase"))
    for t in (f.get("obra"), f.get("autor")) if isinstance(f, dict) else ():
        if t:
            corpo = corpo.replace(t, "")  # título/autor com dígito (1984, Fahrenheit 451) não é dado
    num_solto = any(not ANO.match(n) for n in NUM.findall(corpo)) and r.get("area") != "legislação"
    if (r.get("area") == "dados" or "%" in corpo or num_solto) and r.get("verificarFonte") is not True:
        err(f"repertorio {i}: dado/número/% exige verificarFonte:true")
rep_ids = ids_unicos(rep, "repertorios")

if isinstance(tem, dict):
    if tem.get("aviso") != AVISO:
        err("temas: aviso literal ausente/diferente")
    d = tem.get("datas")
    if not (isinstance(d, dict) and txt(d.get("texto"))):
        err("temas: datas.texto ausente")
    elif d.get("status") != DATA_STATUS:
        err(f"temas: datas.status deve ser {DATA_STATUS!r}")
    elif not all(https(u) for u in d.get("fontes", [])):
        err("temas: datas.fontes com URL não https")
    for a in tem.get("anteriores", []):
        if not (isinstance(a.get("ano"), int) and txt(a.get("tema")) and a.get("status") == ANT_STATUS):
            err(f"temas: anterior inválido {a.get('ano')!r}")
    prev = tem.get("previsoes")
    if not isinstance(prev, list):
        err("temas: previsoes deve ser lista")
        prev = []
    for p in prev:
        i = p.get("id", "?")
        if not (txt(p.get("tema")) and txt(p.get("justificativa"))):
            err(f"previsao {i}: tema/justificativa vazio")
        if p.get("prob") not in PROBS:
            err(f"previsao {i}: prob inválida {p.get('prob')!r}")
        if not all(https(u) for u in p.get("fontes", [])) or not p.get("fontes"):
            err(f"previsao {i}: fontes vazias ou não https")
        if not isinstance(p.get("repertorios"), list):
            err(f"previsao {i}: repertorios deve ser lista")
    prev_ids = ids_unicos(prev, "previsoes")

for a in aul:
    i = a.get("id", "?")
    if not txt(a.get("titulo")):
        err(f"aula {i}: titulo vazio")
    if "competencia" in a and a["competencia"] not in COMPS:
        err(f"aula {i}: competencia inválida")
    bl = a.get("blocos")
    if not (isinstance(bl, list) and bl):
        err(f"aula {i}: blocos vazio")
        continue
    for b in bl:
        if not txt(b.get("rotulo")) or not (txt(b.get("texto")) or (isinstance(b.get("itens"), list) and b["itens"])):
            err(f"aula {i}: bloco sem rotulo ou texto/itens")
    if not all(https(u) for u in a.get("fontes", [])):
        err(f"aula {i}: fonte não https")
ids_unicos(aul, "aulas")
comp_aulas = {a.get("competencia") for a in aul}
for c in COMPS:
    if c not in comp_aulas:
        err(f"aulas: falta lição {c}")
titulos = " ".join(a.get("titulo", "").lower() for a in aul)
for t in ("estrutura", "proposta de intervenção", "nota zero"):
    if t not in titulos:
        err(f"aulas: falta lição {t!r}")

for m in mod:
    i = m.get("ano", "?")
    if not (isinstance(m.get("ano"), int) and txt(m.get("tema")) and txt(m.get("provaOrigem"))):
        err(f"modelo {i}: ano/tema/provaOrigem inválido")
    if m.get("status") != MOD_STATUS:
        err(f"modelo {i}: status deve ser {MOD_STATUS!r}")
    fu = m.get("fonteUrl")
    if fu is not None and not (https(fu) and ("gov.br" in fu or "inep" in fu)):
        err(f"modelo {i}: fonteUrl deve ser null ou https gov.br/inep")
    tr = m.get("trechos")
    if not isinstance(tr, list):
        err(f"modelo {i}: trechos deve ser lista")
        tr = []
    for t in tr:
        x = t.get("texto", "")
        if not (txt(x) and len(x) <= 220 and x.count("\n") <= 1):
            err(f"modelo {i}: trecho >220 chars ou >2 linhas")
        if not (txt(t.get("nota")) and https(t.get("url"))):
            err(f"modelo {i}: trecho sem nota ou url https")
    an = m.get("analise")
    if an is not None:
        if not (isinstance(an, dict) and len(an.get("estrutura", [])) == 4 and txt(an.get("tese"))
                and len(an.get("argumentos", [])) == 2 and set(an.get("competencias", {})) == set(COMPS)
                and isinstance(an.get("proposta"), dict) and set(an["proposta"]) == set(PROPOSTA)
                and isinstance(an.get("repertorioIds"), list)):
            err(f"modelo {i}: analise fora do schema")
fim("schema")

# 3. refs cruzadas
for p in prev:
    for r in p["repertorios"]:
        if r not in rep_ids:
            err(f"previsao {p['id']}: repertorio inexistente {r}")
for m in mod:
    for r in (m.get("analise") or {}).get("repertorioIds", []):
        if r not in rep_ids:
            err(f"modelo {m['ano']}: repertorioId inexistente {r}")
fim("refs")

# 4. contagem por eixo
por_eixo = {e: sum(e in r["eixos"] for r in rep) for e in EIXOS}
for e, n in por_eixo.items():
    if not 12 <= n <= 20:
        err(f"eixo {e!r}: {n} repertórios (meta 12-20)")
fim("contagem")

# 5. tokens: sem #hex e sem Npx fora de tokens.css
for rel in ("css/app.css", "css/mat.css", "js/app.js", "js/mat.js", "js/quadro.js", "index.html"):
    for n, linha in enumerate((ROOT / rel).read_text(encoding="utf-8").splitlines(), 1):
        if re.search(r"#[0-9a-fA-F]{3,8}\b", linha) or re.search(r"\dpx\b", linha):
            err(f"{rel}:{n}: hex ou px fora de tokens.css")
fim("tokens")

# 5b. segurança: sem HTML dinâmico em js/, sem inline em index.html, com meta CSP
PERIGO = re.compile(r"innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function")
for f in sorted((ROOT / "js").glob("*.js")):
    for n, linha in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
        if PERIGO.search(linha) and not linha.lstrip().startswith(("//", "/*", "*")):  # comentário pode citar a API
            err(f"js/{f.name}:{n}: API de HTML dinâmico/eval proibida")
idx = (ROOT / "index.html").read_text(encoding="utf-8")
for n, linha in enumerate(idx.splitlines(), 1):
    if re.search(r"<style|style=|\son[a-z]+=|<script>", linha):
        err(f"index.html:{n}: <style>, style=, on*= ou <script> inline")
if "Content-Security-Policy" not in idx:
    err("index.html: meta CSP ausente")
fim("segurança")

# 5c. livros: data/livros.json (4 livros legíveis) x LIVROS/COM_TEXTO de js/escola.js
esc = (ROOT / "js" / "escola.js").read_text(encoding="utf-8")
acervo = {i: (t, a) for i, t, a in re.findall(r"\{ id: '(l\d+)', titulo: '([^']+)', autor: '([^']+)'", esc)}
mct = re.search(r"COM_TEXTO = \[([^\]]*)\]", esc)
com_texto = set(re.findall(r"'(l\d+)'", mct.group(1))) if mct else set()
lv = carrega("livros")
lista = lv.get("livros") if isinstance(lv, dict) else None
if lv is not None:
    if not isinstance(lista, list) or len(lista) != 4:
        err("livros: precisa de exatamente 4 livros")
    else:
        ids = ids_unicos(lista, "livros")
        if len(acervo) != 12:
            err(f"livros: LIVROS de js/escola.js tem {len(acervo)} itens (esperado 12)")
        if ids != com_texto:
            err(f"livros: ids do JSON {sorted(ids)} != COM_TEXTO {sorted(com_texto)}")
        for l in lista:
            i = l.get("id")
            if i not in acervo:
                err(f"livros/{i}: id fora de LIVROS")
            elif (l.get("titulo"), l.get("autor")) != acervo[i]:
                err(f"livros/{i}: titulo/autor diferem de LIVROS")
            if not txt(l.get("sinopse")):
                err(f"livros/{i}: sinopse vazia")
            cs = l.get("capitulos")
            if not isinstance(cs, list) or len(cs) != 3:
                err(f"livros/{i}: precisa de 3 capítulos")
                continue
            for k, c in enumerate(cs, 1):
                if not (txt(c.get("titulo")) and txt(c.get("texto"))):
                    err(f"livros/{i}/{k}: titulo/texto vazio")
                    continue
                n = len(c["texto"].split())
                if not 100 <= n <= 200:
                    err(f"livros/{i}/{k}: {n} palavras (esperado 100-200)")
                if "<" in c["texto"] or "<" in c["titulo"]:
                    err(f"livros/{i}/{k}: '<' no texto")
fim("livros")

# 6. matematica: data/matematica/dN.json (lista de tópicos do dia N)
MAT = ["d1", "d2", "d3", "d4", "d5", "d6"]  # cresce por lote: "d1", "d2", ...
MIGRADOS = ["d1", "d2", "d3", "d4", "d5", "d6"]  # arquivos que exigem quando+ler e conta/valor em resposta numérica
PAPEIS = {"pede", "dado", "distracao", "unidade", "condicao"}
NIVEIS = {"basico", "intermediario", "avancado"}
HAB = {"C1": (1, 5), "C2": (6, 9), "C3": (10, 14), "C4": (15, 18), "C5": (19, 23), "C6": (24, 26), "C7": (27, 30)}
ENEM_ANO = re.compile(r"enem\W{0,3}(19|20)\d\d", re.I)
FUNCS = {"sqrt": math.sqrt, "log": math.log, "log10": math.log10, "comb": math.comb, "factorial": math.factorial}
OPS = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
       ast.Div: lambda a, b: a / b, ast.Pow: lambda a, b: a ** b}


def calc(no, env=None):
    """Walker ast com whitelist (nunca eval). env: variáveis do gerador."""
    env = env or {}
    if isinstance(no, ast.Expression):
        return calc(no.body, env)
    if isinstance(no, ast.Constant) and isinstance(no.value, (int, float)) and not isinstance(no.value, bool):
        return no.value
    if isinstance(no, ast.Name) and no.id == "pi":
        return math.pi
    if isinstance(no, ast.Name) and no.id in env:
        return env[no.id]
    if isinstance(no, ast.UnaryOp) and isinstance(no.op, (ast.USub, ast.UAdd)):
        v = calc(no.operand, env)
        return -v if isinstance(no.op, ast.USub) else v
    if isinstance(no, ast.BinOp) and type(no.op) in OPS:
        a, b = calc(no.left, env), calc(no.right, env)
        if isinstance(no.op, ast.Pow) and abs(b) > 100:
            raise ValueError("expoente grande")
        return OPS[type(no.op)](a, b)
    if isinstance(no, ast.Call) and isinstance(no.func, ast.Name) and no.func.id in FUNCS and not no.keywords:
        return FUNCS[no.func.id](*[calc(a, env) for a in no.args])
    raise ValueError(f"nó não permitido: {type(no).__name__}")


def notacao(s, onde):
    """Chaves balanceadas; '{' só após ^, _, sqrt ou abrindo fração {a/b} (com '/' no nível dele)."""
    pilha = []  # cada item: [é_fracao, nº de '/' no nível dele]
    for i, c in enumerate(s):
        if c == "{":
            ant = s[:i]
            frac = not (ant.endswith("^") or ant.endswith("_") or ant.endswith("sqrt"))
            pilha.append([frac, 0])
        elif c == "}":
            if not pilha:
                err(f"{onde}: '}}' sem abertura")
                return
            frac, barra = pilha.pop()
            if frac and barra > 1:
                err(f"{onde}: fração {{...}} com mais de uma '/' no mesmo nível")
            elif frac and not barra:
                err(f"{onde}: '{{...}}' sem ^ _ sqrt precisa ser fração {{a/b}}")
        elif c == "/" and pilha:
            pilha[-1][1] += 1
    if pilha:
        err(f"{onde}: chave não fechada")


def casas(v):
    s = repr(float(v))
    return len(s.split(".")[1].rstrip("0")) if "." in s else 0


def ptbr(v, c):
    base = f"{v:.{c}f}"
    inteiro, _, dec = base.partition(".")
    sufixo = "," + dec if dec else ""
    return {inteiro + sufixo, f"{int(inteiro):,}".replace(",", ".") + sufixo}


ID = re.compile(r"[A-Za-z_]\w*")
PH = re.compile(r"\{([A-Za-z_]\w*)\}")
RESTR = {"inteiro", "positivo", "naozero"}
MAX_GRADE = 2000
AMOSTRAS = 50


def avalia(expr, env):
    """calc de string; devolve número finito ou levanta ValueError."""
    try:
        v = calc(ast.parse(str(expr), mode="eval"), env)
    except (SyntaxError, ZeroDivisionError, TypeError, OverflowError) as x:
        raise ValueError(str(x) or type(x).__name__)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise ValueError("resultado não finito")
    return v


def mult(x, c):
    return abs(x * 10 ** c - round(x * 10 ** c)) < 1e-9


def preenche(tpl, vals, cas):
    """Espelho de preencher() em js/mat.js: {id} -> número pt-BR; após ^ _ sqrt vira {n}."""
    def sub(m):
        i = m.group(1)
        if i not in vals:
            return m.group(0)
        t = f"{(vals[i] or 0.0):.{cas[i]}f}".replace(".", ",")
        return "{" + t + "}" if re.search(r"(\^|_|sqrt)$", tpl[:m.start()]) else t
    return PH.sub(sub, tpl)


def vars_ok(vs, o):
    """Valida {id:{min,max,step?,casas?}}; devolve {id:(min,max,step,casas)}."""
    out = {}
    if not isinstance(vs, dict):
        err(f"{o}: vars deve ser objeto")
        return out
    num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
    for i, v in vs.items():
        c = v.get("casas", 0) if isinstance(v, dict) else None
        if not (ID.fullmatch(i) and i not in ("valor", "pi") and i not in FUNCS):
            err(f"{o}: nome de var inválido {i!r}")
        elif not (isinstance(v, dict) and num(v.get("min")) and num(v.get("max")) and v["min"] <= v["max"]
                  and isinstance(c, int) and not isinstance(c, bool) and 0 <= c <= 4):
            err(f"{o}: var {i} precisa de min<=max numéricos e casas 0-4")
        else:
            st = v.get("step", 10 ** -c)
            if not (num(st) and st > 0 and mult(st, c) and mult(v["min"], c)):
                err(f"{o}: var {i}: step>0 e step/min múltiplos de 10^-casas")
            else:
                out[i] = (v["min"], v["max"], st, c)
    return out


CONC = [0, 0]  # questões de gerador com conceito / total


def valida_gerador(g, o):
    """gerador: schema + simulação (grade <= MAX_GRADE ou AMOSTRAS seeds) de cada questão."""
    if not (isinstance(g, dict) and set(g) <= {"vars", "deriv", "restricoes", "questoes"} and "vars" in g and "questoes" in g):
        err(f"{o} gerador: precisa de vars e questoes (opcionais: deriv, restricoes; por questão: vars, deriv, restricoes, negativo)")
        return
    top = vars_ok(g["vars"], f"{o} gerador")
    der0 = g.get("deriv", {})
    if not (isinstance(der0, dict) and all(ID.fullmatch(k) and txt(x) for k, x in der0.items())):
        err(f"{o} gerador: deriv deve ser {{nome: expr}}")
        der0 = {}
    rs = g.get("restricoes", [])
    qs = g["questoes"]
    if not (isinstance(qs, list) and len(qs) == 5 and isinstance(rs, list)):
        err(f"{o} gerador: questoes deve ter 5 itens e restricoes ser lista")
        return
    for n, q in enumerate(qs, 1):
        oq = f"{o} gerador q{n}"
        if not (isinstance(q, dict) and txt(q.get("enunciado")) and txt(q.get("conta")) and isinstance(q.get("unidade"), str)
                and isinstance(q.get("casas"), int) and not isinstance(q.get("casas"), bool) and 0 <= q["casas"] <= 4
                and isinstance(q.get("passos"), list) and 2 <= len(q["passos"]) <= 6 and all(txt(x) for x in q["passos"])
                and isinstance(q.get("negativo", True), bool)):
            err(f"{oq}: enunciado/conta/unidade/casas(0-4)/passos(2-6) inválidos")
            continue
        CONC[1] += 1
        if "conceito" in q:
            if txt(q["conceito"]):
                CONC[0] += 1
                notacao(q["conceito"], f"{oq} conceito")
            else:
                err(f"{oq}: conceito deve ser texto não vazio")
        vs = dict(top)
        der = dict(der0)
        qd = q.get("deriv", {})
        if isinstance(qd, dict) and all(ID.fullmatch(k) and txt(x) for k, x in qd.items()):
            der.update(qd)
        else:
            err(f"{oq}: deriv deve ser {{nome: expr}}")
        if "vars" in q:
            vs.update(vars_ok(q["vars"], oq))
        rq = rs + (q["restricoes"] if isinstance(q.get("restricoes"), list) else [])
        if not all(isinstance(r, list) and len(r) == 2 and r[0] in RESTR and txt(r[1]) for r in rq):
            err(f"{oq}: restricoes devem ser [inteiro|positivo|naozero, expr]")
            continue
        if not vs:
            err(f"{oq}: sem variáveis")
            continue
        tpls = [q["enunciado"]] + q["passos"]
        indef = {i for t in tpls for i in PH.findall(t)} - set(vs) - set(der) - {"valor"}
        for i in sorted(indef):
            err(f"{oq}: placeholder {{{i}}} indefinido")
        ids = list(vs)
        cont = [math.floor((vs[i][1] - vs[i][0]) / vs[i][2] + 1e-9) + 1 for i in ids]
        if math.prod(cont) <= MAX_GRADE:
            combos = itertools.product(*[range(c) for c in cont])
        else:
            combos = (tuple(min(c - 1, int(r.random() * c)) for c in cont) for r in map(random.Random, range(AMOSTRAS)))
        total = aceitos = 0
        msgs = set()
        for combo in combos:
            total += 1
            env = {i: round(vs[i][0] + vs[i][2] * k, 6) for i, k in zip(ids, combo)}
            cas = {i: vs[i][3] for i in ids}
            try:
                for k, x in der.items():
                    env[k] = round(avalia(x, env), 6)
                    s = repr(env[k])
                    cas[k] = len(s.split(".")[1].rstrip("0")) if "." in s else 0
                ok = True
                for tipo, x in rq:
                    v = avalia(x, env)
                    ok &= abs(v - round(v)) <= 1e-9 if tipo == "inteiro" else v > 0 if tipo == "positivo" else abs(v) > 1e-9
                if not ok:
                    continue
                v = avalia(q["conta"], env)
            except ValueError as x:
                msgs.add(f"{oq}: expressão falha em {env} ({x})")
                continue
            aceitos += 1
            if q["casas"] == 0 and abs(v - round(v)) > 1e-9:
                msgs.add(f"{oq}: casas 0 mas conta dá {v} em {env}")
            if q.get("negativo") is False and v < -1e-9:
                msgs.add(f"{oq}: negativo:false mas conta dá {v} em {env}")
            if aceitos <= 5:
                env["valor"], cas["valor"] = v, q["casas"]
                for t in tpls:
                    f = preenche(t, env, cas)
                    if PH.search(f):
                        msgs.add(f"{oq}: texto preenchido com {{id}} sobrando: {f[:60]!r}")
                    n0 = len(errs)
                    notacao(f, f"{oq} (preenchido)")
                    del errs[n0 + 1:]  # um erro de notação por texto basta
        for m in sorted(msgs)[:3]:
            err(m)
        if not aceitos or aceitos < 0.2 * total:
            err(f"{oq}: aceite {aceitos}/{total} < 20%")


mat_ids = {}
mat_dia = {}
mat_arqs = sorted(p.stem for p in (ROOT / "data" / "matematica").glob("*.json"))
if mat_arqs != sorted(MAT):
    err(f"matematica: arquivos {mat_arqs} != MAT {sorted(MAT)}")
mat = {}
for nome in MAT:
    p = ROOT / "data" / "matematica" / f"{nome}.json"
    try:
        mat[nome] = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        err(f"matematica/{nome}.json inválido: {e}")
        continue
    if not (isinstance(mat[nome], list) and mat[nome]):
        err(f"matematica/{nome}.json deve ser lista não vazia")
        mat[nome] = []

# 6b. matérias novas: data/<slug>/d1.json (2 tópicos; conceito obrigatório em cada questão do gerador)
HAB_NAT = {"C1": (1, 3), "C2": (4, 7), "C3": (8, 12), "C4": (13, 16), "C5": (17, 19), "C6": (20, 23), "C7": (24, 27), "C8": (28, 30)}
HAB_HUM = {"C1": (1, 5), "C2": (6, 10), "C3": (11, 15), "C4": (16, 20), "C5": (21, 25), "C6": (26, 30)}
NOVAS = {"fisica": HAB_NAT, "quimica": HAB_NAT, "biologia": HAB_NAT, "geografia": HAB_HUM, "historia": HAB_HUM,
         "filosofia": HAB_HUM, "sociologia": HAB_HUM}
novas = {}
for slug in NOVAS:
    p = ROOT / "data" / slug / "d1.json"
    if not p.exists():
        err(f"FALTA data/{slug}/d1.json")
        continue
    try:
        novas[slug] = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        err(f"{slug}/d1.json inválido: {e}")
        continue
    if not (isinstance(novas[slug], list) and len(novas[slug]) == 2):
        err(f"{slug}/d1.json deve ser lista de exatamente 2 tópicos")
        novas[slug] = []
fim("matematica-arquivos")

ITENS = [(nome, lista, HAB) for nome, lista in mat.items()] + [(f"{s}/d1", l, NOVAS[s]) for s, l in novas.items()]
for nome, lista, HABX in ITENS:
    for t in lista:
        i = t.get("id", "?") if isinstance(t, dict) else "?"
        o = f"{nome}/{i}"
        if not isinstance(t, dict) or not txt(t.get("id")):
            err(f"{nome}: tópico sem id")
            continue
        if i in mat_ids:
            err(f"{o}: id repetido (também em {mat_ids[i]})")
        mat_ids[i] = nome
        mat_dia[i] = (nome, t)
        if t.get("nivel") not in NIVEIS:
            err(f"{o}: nivel inválido {t.get('nivel')!r}")
        if not txt(t.get("titulo")):
            err(f"{o}: titulo vazio")
        comp = t.get("competencia")
        if comp not in HABX:
            err(f"{o}: competencia inválida {comp!r}")
        hs = t.get("habilidades")
        ns = []
        if not (isinstance(hs, list) and hs):
            err(f"{o}: habilidades vazio")
        else:
            for x in hs:
                m = re.fullmatch(r"H(\d+)", x) if isinstance(x, str) else None
                if not m or not 1 <= int(m.group(1)) <= 30:
                    err(f"{o}: habilidade inválida {x!r}")
                else:
                    ns.append(int(m.group(1)))
            if comp in HABX and ns and not any(HABX[comp][0] <= n <= HABX[comp][1] for n in ns):
                err(f"{o}: nenhuma H da competência {comp}")
        if "antes" in t and not txt(t["antes"]):
            err(f"{o}: antes vazio")
        con = t.get("conceito")
        if not (isinstance(con, list) and con and all(txt(x) for x in con)):
            err(f"{o}: conceito deve ser lista de parágrafos")
        exs = t.get("exemplos")
        if not (isinstance(exs, list) and exs):
            err(f"{o}: exemplos vazio")
            exs = []
        for e in exs:
            if not (isinstance(e, dict) and txt(e.get("enunciado")) and isinstance(e.get("passos"), list)
                    and e["passos"] and all(txt(x) for x in e["passos"])):
                err(f"{o}: exemplo sem enunciado/passos")
            elif "formula" in e and not txt(e["formula"]):
                err(f"{o}: exemplo com formula vazia")
        for k in ("truque", "erroComum"):
            if not txt(t.get(k)):
                err(f"{o}: {k} vazio")
        ex = t.get("exercicios")
        if not (isinstance(ex, list) and 3 <= len(ex) <= 5):
            err(f"{o}: exercicios deve ter 3-5 itens")
            ex = []
        for n, e in enumerate(ex, 1):
            oe = f"{o} ex{n}"
            if not (isinstance(e, dict) and txt(e.get("enunciado")) and txt(e.get("resposta"))
                    and isinstance(e.get("passos"), list) and e["passos"] and all(txt(x) for x in e["passos"])):
                err(f"{oe}: enunciado/passos/resposta inválidos")
                continue
            if ("conta" in e) != ("valor" in e):
                err(f"{oe}: conta e valor andam juntos")
            if "conta" in e:
                v = e["valor"]
                if not (isinstance(v, (int, float)) and not isinstance(v, bool)):
                    err(f"{oe}: valor deve ser número")
                    continue
                try:
                    c = calc(ast.parse(str(e["conta"]), mode="eval"))
                except (ValueError, SyntaxError, ZeroDivisionError, TypeError, OverflowError) as x:
                    err(f"{oe}: conta inválida ({x})")
                    continue
                k = casas(v)
                if abs(c - v) > 0.5 * 10 ** -k:
                    err(f"{oe}: conta dá {c} mas valor é {v}")
                # aceita zeros extras (R$ 168,00 para 168; 1.210,50 para 1210,5)
                if not any(re.search(r"(?<![\d,.])" + re.escape(s) + (r"0*" if "," in s else r"(?:,0+)?") + r"(?!\d|[,.]\d)", e["resposta"]) for s in ptbr(v, k)):
                    err(f"{oe}: resposta não contém o valor {v} em pt-BR")
        qd, lr = t.get("quando"), t.get("ler")
        if nome in MIGRADOS:
            for k, v in (("quando", qd), ("ler", lr)):
                if v is None:
                    err(f"{o}: {k} obrigatório em arquivo migrado")
            for n, e in enumerate(ex, 1):
                if isinstance(e, dict) and NUM.search(str(e.get("resposta", ""))) and "conta" not in e:
                    err(f"{o} ex{n}: resposta numérica sem conta/valor")
        if qd is not None:
            if not (isinstance(qd, dict) and isinstance(qd.get("sinais"), list) and 2 <= len(qd["sinais"]) <= 6
                    and all(txt(x) for x in qd["sinais"]) and txt(qd.get("formula"))
                    and isinstance(qd.get("armadilhas"), list) and 1 <= len(qd["armadilhas"]) <= 3
                    and all(txt(x) for x in qd["armadilhas"])):
                err(f"{o}: quando fora do schema")
                qd = None
        fm = t.get("formulas")
        if fm is None and nome in MIGRADOS:
            err(f"{o}: formulas obrigatório em arquivo migrado")
        if fm is not None:
            if not (isinstance(fm, list) and 2 <= len(fm) <= 6 and all(
                    isinstance(x, dict) and txt(x.get("nome")) and txt(x.get("f")) and txt(x.get("uso")) for x in fm)):
                err(f"{o}: formulas fora do schema (2-6 itens {{nome, f, uso}})")
                fm = None
        if lr is not None:
            exl = lr.get("exemplo") if isinstance(lr, dict) else None
            ok = (isinstance(lr, dict) and isinstance(lr.get("passos"), list) and 3 <= len(lr["passos"]) <= 6
                  and all(txt(x) for x in lr["passos"]) and isinstance(exl, dict) and txt(exl.get("enunciado"))
                  and isinstance(exl.get("anotacoes"), list) and exl["anotacoes"])
            if not ok:
                err(f"{o}: ler fora do schema")
                lr = None
            else:
                for a in exl["anotacoes"]:
                    if not (isinstance(a, dict) and txt(a.get("trecho")) and txt(a.get("nota")) and a.get("papel") in PAPEIS):
                        err(f"{o}: ler.anotacao inválida {a!r}"[:120])
                    elif a["trecho"] not in exl["enunciado"]:
                        err(f"{o}: trecho fora do enunciado {a['trecho']!r}")
                fx = [(exl["enunciado"].index(a["trecho"]), exl["enunciado"].index(a["trecho"]) + len(a["trecho"]), a["trecho"])
                      for a in exl["anotacoes"] if isinstance(a, dict) and isinstance(a.get("trecho"), str) and a["trecho"] in exl["enunciado"]]
                fx.sort()
                for (i0, f0, t0), (i1, f1, t1) in zip(fx, fx[1:]):
                    if i1 < f0:
                        err(f"{o}: trechos se sobrepõem {t0!r} e {t1!r}")
        if "gerador" in t:
            valida_gerador(t["gerador"], o)
            if "/" in nome:  # matéria nova: conceito obrigatório
                gq = t["gerador"].get("questoes") if isinstance(t["gerador"], dict) else None
                for n, q in enumerate(gq if isinstance(gq, list) else [], 1):
                    if isinstance(q, dict) and "conceito" not in q:
                        err(f"{o} gerador q{n}: conceito obrigatório em matéria nova")
        else:
            err(f"{o}: gerador obrigatório (jogo)")
        cs = t.get("cartoes")
        if not (isinstance(cs, list) and 2 <= len(cs) <= 5 and all(isinstance(c, dict) and txt(c.get("p")) and txt(c.get("r")) for c in cs)):
            err(f"{o}: cartoes deve ter 2-5 {{p, r}}")
            cs = []
        # texto livre: mini-notação e proibição de "ENEM"+ano
        campos = [("titulo", t.get("titulo"))] + [("conceito", x) for x in (con if isinstance(con, list) else [])]
        for e in exs:
            if isinstance(e, dict):
                campos += [("exemplo.enunciado", e.get("enunciado")), ("exemplo.formula", e.get("formula"))]
                campos += [("exemplo.passo", x) for x in (e.get("passos") or [])]
        campos += [("truque", t.get("truque")), ("erroComum", t.get("erroComum"))]
        for e in ex:
            if isinstance(e, dict):
                campos += [("ex.enunciado", e.get("enunciado")), ("ex.resposta", e.get("resposta"))]
                campos += [("ex.passo", x) for x in (e.get("passos") or [])]
        for c in cs:
            campos += [("cartao.p", c.get("p")), ("cartao.r", c.get("r"))]
        if qd:
            campos += [("quando.formula", qd["formula"])] + [("quando.sinal", x) for x in qd["sinais"]] + [("quando.armadilha", x) for x in qd["armadilhas"]]
        if fm:
            campos += [("formulas.nome", x["nome"]) for x in fm] + [("formulas.f", x["f"]) for x in fm] + [("formulas.uso", x["uso"]) for x in fm]
        if lr:
            campos += [("ler.passo", x) for x in lr["passos"]] + [("ler.enunciado", lr["exemplo"]["enunciado"])]
            campos += [("ler.nota", a.get("nota")) for a in lr["exemplo"]["anotacoes"] if isinstance(a, dict)]
        for k, v in campos:
            if isinstance(v, str):
                notacao(v, f"{o} {k}")
                if ENEM_ANO.search(v):
                    err(f"{o} {k}: não use ENEM + ano")
for i, (nome, t) in mat_dia.items():
    if "antes" in t and t["antes"] not in mat_ids:
        err(f"{nome}/{i}: antes inexistente {t['antes']!r}")
fim("matematica")
for slug, lista in novas.items():
    print(f"OK {slug}: {len(lista)} tópicos")

tst = carrega("teste")
if tst is not None:
    bl = tst.get("blocos") if isinstance(tst, dict) else None
    if not isinstance(bl, list) or [b.get("id") for b in bl if isinstance(b, dict)] != ["antes", "depois"]:
        err("teste: blocos devem ser antes e depois")
    else:
        for b in bl:
            qs = b.get("questoes")
            if not isinstance(qs, list) or len(qs) != 5:
                err(f"teste/{b['id']}: precisa de 5 questões")
                continue
            for i, q in enumerate(qs):
                al, c = q.get("alternativas"), q.get("correta")
                if not txt(q.get("enunciado")) or not txt(q.get("materia")):
                    err(f"teste/{b['id']}/{i}: enunciado/materia vazio")
                if not (isinstance(al, list) and len(al) == 4 and all(txt(a) for a in al) and len(set(al)) == 4):
                    err(f"teste/{b['id']}/{i}: 4 alternativas distintas")
                if not (isinstance(c, int) and not isinstance(c, bool) and 0 <= c < 4):
                    err(f"teste/{b['id']}/{i}: correta fora de 0..3")
fim("teste")
resumo = ", ".join(f"{e}: {n}" for e, n in por_eixo.items())
print(f"OK: {len(rep)} repertórios | por eixo: {resumo} | temas: {len(prev)} | aulas: {len(aul)} | modelos: {len(mod)} | teste: 2x5")
todos = [t for lista in mat.values() for t in lista]
if todos:
    cc = sum(any("conta" in e for e in t["exercicios"]) for t in todos)
    por_dia = ", ".join(f"{d}: {len(mat[d])}" for d in MAT)
    por_c = ", ".join(f"{c}: {sum(t['competencia'] == c for t in todos)}" for c in HAB)
    print(f"OK matematica: {len(todos)} tópicos | por dia: {por_dia} | por C: {por_c} | com conta: {100 * cc // len(todos)}% | com jogo: {sum('gerador' in t for t in todos)}/{len(todos)} | com conceito: {CONC[0]}/{CONC[1]}")
