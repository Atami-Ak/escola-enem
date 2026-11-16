# Escola ENEM

Projeto escolar: um site de estudo para o ENEM, em forma de jogo. Feito com HTML, CSS e JavaScript puros, sem framework, sem build e sem servidor de banco de dados. Tudo que o aluno faz fica salvo no próprio navegador (`localStorage`).

## O que tem

- **Início:** o aluno digita o nome (não há login) e vê nível, XP e sequência de dias.
- **Matérias:** 9 matérias.
  - Redação: repertório, temas, aulas, modelos e um quadro para montar a redação.
  - Matemática: 30 tópicos em 6 dias, com lição, jogo de questões, treino, caderno e progresso.
  - Física, Química, Biologia, Geografia, História, Filosofia e Sociologia: 2 tópicos cada, no mesmo formato de Matemática.
- **Agenda:** plano de estudos por dia da semana, contagem para o ENEM (data prevista), aulas em vídeo (busca no YouTube) e compromissos (provas, tarefas e metas, com prazos e "concluir").
- **Estudo na Agenda:** aviso do dia, tempo por matéria, sessão com timer (Pomodoro), resumo semanal; os minutos de foco dão XP.
- **Biblioteca:** estante com 12 livros **fictícios** (marcar como "Quero ler" ou "Lido").
- **Biblioteca:** 4 livros fictícios legíveis em data/livros.json (validados por tools/check.py).
- **Jogo de questões:** cada questão sorteia números novos, tem dica e mostra o **conceito** da questão e a resolução passo a passo.

XP = 10 por ponto no jogo + 30 por lição concluída + 20 por item da agenda concluído + floor(min/3) pelos minutos de foco de estudo (conta no máximo 180 min por dia). Nível = XP ÷ 200 + 1.

## Como rodar

Precisa só de Python 3 (para um servidor local) e de um navegador.

```bash
python serve.py 8000
```

Depois abra <http://localhost:8000>.

## Testes

```bash
python tools/check.py
node tools/mat_test.js
node tools/dados_test.js
node tools/escola_test.js
node --check js/app.js
node --check js/mat.js
node --check js/escola.js
```

`check.py` valida todos os arquivos de dados (matérias, tópicos, questões do jogo e conceitos).

## Estrutura

```
index.html        página única (rotas por # na URL)
css/              tokens.css (cores), app.css, mat.css, escola.css
js/app.js         Redação e roteamento
js/mat.js         motor das matérias (lição, jogo, treino, caderno, progresso)
js/escola.js      Início, Matérias, Agenda e Biblioteca
data/             conteúdo em JSON, uma pasta por matéria
tools/            validações
serve.py          servidor local
```

Rotas: `#inicio`, `#materias`, `#agenda`, `#biblioteca`, `#livro/<id>`, `#teste`, `#repertorio` (Redação) e `#<matéria>/trilha` (por exemplo `#fisica/trilha`).

## Conferir conteúdo

Os textos e as questões de Física, Química, Biologia, Geografia, História, Filosofia e Sociologia foram **escritos com ajuda de IA** e ainda precisam de revisão por um professor antes de serem usados para estudar. As competências e habilidades indicadas (C1, H1…) foram associadas pelo tema, não conferidas uma a uma com a matriz oficial. Os dados de população, produção e pesquisas nos enunciados são **fictícios**. Os livros da Biblioteca também são fictícios.

## Publicar no GitHub

1. Crie um repositório vazio em github.com (por exemplo `escola-enem`).
2. Na pasta do projeto:

```bash
git init
git add .
git commit -m "Projeto Escola ENEM"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/escola-enem.git
git push -u origin main
```

3. Para deixar o site no ar: no GitHub, abra **Settings, Pages**, escolha a branch `main` e a pasta raiz. O endereço aparece ali depois de alguns minutos.

A pasta `.claude/` (planos e anotações de trabalho) está no `.gitignore` e não vai para o GitHub.

Segurança e limites: veja [SECURITY.md](SECURITY.md).
