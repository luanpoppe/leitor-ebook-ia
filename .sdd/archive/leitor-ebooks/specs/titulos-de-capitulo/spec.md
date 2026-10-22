# Spec: Títulos de capítulo

> Parte de [`leitor-ebooks`](../../plan.md)

## Resumo

Cada capítulo passa a guardar o título que o próprio arquivo traz, e o sumário do leitor deixa de mostrar apenas "Capítulo 1, 2, 3". Os livros que já estão na estante ganham os títulos por um script, sem reenviar arquivo e sem pagar embeddings de novo.

## Histórias do usuário

### HU-1: Sumário com nomes reais

> **Como** leitor, **quero** ver o nome de cada capítulo no sumário, **para** escolher onde começar ou retomar sem contar posições.

#### CT-01: EPUB com sumário mostra os títulos do livro

- **Dado que** a estante tem `dom-casmurro.epub`, cujo sumário traz "Capítulo I — O Rio de Janeiro"
- **Quando** o leitor abre o sumário desse livro
- **Então** o primeiro capítulo aparece com o título "Capítulo I — O Rio de Janeiro"
- **E** a ordem dos títulos acompanha a ordem do livro
- **E** nenhum título vem com marcação HTML ou entidade (`&amp;`, `<b>`)

#### CT-02: PDF com outline mostra os títulos do outline

- **Dado que** a estante tem `relatorio-anual.pdf` com outline "1. Introdução" e "2. Resultados"
- **Quando** o leitor abre o sumário desse livro
- **Então** os capítulos aparecem como "1. Introdução" e "2. Resultados"
- **E** a capa e o sumário do próprio PDF não viram capítulos

#### CT-03: Formato sem título confiável usa a numeração

- **Dado que** a estante tem `anotacoes.txt` sem marcador de capítulo reconhecível
- **Quando** o leitor abre o sumário desse livro
- **Então** o capítulo aparece como "Capítulo 1"
- **E** o banco guarda título nulo para ele

### HU-2: Livros antigos também ganham título

> **Como** leitor que já tinha livros na estante, **quero** que eles ganhem os títulos, **para** não precisar reenviar o arquivo.

#### CT-04: Script preenche os títulos sem reprocessar o conteúdo

- **Dado que** `dom-casmurro.epub` foi enviado antes de existir título de capítulo
- **Quando** o operador roda o script de reingestão de títulos
- **Então** os capítulos do livro passam a ter os títulos do arquivo original
- **E** o texto dos capítulos e os embeddings continuam os mesmos
- **E** rodar o script de novo não altera nada

#### CT-05: Livro fora do estado pronto é ignorado

- **Dado que** a estante tem um livro `failed` e um `processing`
- **Quando** o operador roda o script de reingestão de títulos
- **Então** os dois são pulados
- **E** o resumo do script informa quantos livros foram atualizados e quantos foram pulados

## Edge cases

- Livro `ready` cujo arquivo sumiu do MinIO → o script registra o livro e segue para o próximo, sem abortar o lote
- Reexecução sobre livro já preenchido → mantém o título existente  ||  não sobrescreve
- EPUB com sumário hierárquico (parte → capítulos) → vale o rótulo mais específico que aponta para o documento; sem correspondência, o primeiro heading do documento
- Capítulo sem título em nenhuma fonte → título nulo  ||  a tela decide o fallback
- Título com mais de 200 caracteres → tratado como suspeito  ||  vira nulo em vez de poluir o sumário
- Título repetido em capítulos diferentes (ex.: "Introdução") → permitido  ||  não deduplica
- PDF sem outline → usa a primeira linha quando o extrator já a reconheceu como título; caso contrário, nulo
- Texto do capítulo começa com o próprio título → o texto não muda  ||  a duplicata é escondida na tela de leitura

## Notas técnicas

### NT-1: Coluna e contrato da extração

`chapters` ganha `title` nullable; a extração passa a devolver `title` junto de `position` e `text` (sustenta HU-1 e HU-2).

```json
// entra (capítulo extraído de um EPUB)
{ "position": 1, "title": "Capítulo I — O Rio de Janeiro", "text": "CAPÍTULO I\n\nO Rio de Janeiro..." }
```

```json
// sai (gravado no banco)
{ "position": 1, "title": "Capítulo I — O Rio de Janeiro" }
```

- **Título vazio, só espaços ou acima de 200 caracteres** → grava `null`.
- **Capítulo descartado por texto vazio** → o título vai com ele; a renumeração mantém título e texto juntos.

### NT-2: Fonte do título por formato

Cada formato tem uma fonte própria (sustenta HU-1).

| Formato | Primeira escolha | Segunda escolha |
|---|---|---|
| EPUB | rótulo do nav/NCX do documento | primeiro `h1`–`h3` do XHTML |
| PDF | título do outline | primeira linha, quando o builder a reconheceu como título |
| MD | texto do heading (`## Capítulo 1`) | — |
| TXT | linha do marcador ("CAPÍTULO 1", "Chapter II") | — |

- **Sumário do EPUB não cobre o documento** → cai para o heading; sem heading, `null`.
- **Título com entidades ou tags** → decodificado e normalizado antes de gravar.

### NT-3: Script de reingestão de títulos

Comando manual e idempotente, só para livros `ready` (sustenta HU-2). Baixa o original do MinIO, extrai de novo e atualiza **apenas** `chapters.title`, casando por `position`.

```bash
pnpm --filter @leitor-ebook-ia/backend run backfill:titles
```

```json
// sai
{ "scanned": 8, "updated": 6, "skipped": 1, "failed": 1 }
```

- **Arquivo ausente no MinIO** → conta em `failed`, registra o id e continua o lote.
- **Quantidade de capítulos diferente da atual** → pula o livro e registra aviso; não mexe no conteúdo.
- **Livro já com título** → não sobrescreve; conta em `skipped`.

## Contratos expostos

- `chapters.title` — `packages/backend/prisma/schema.prisma:Chapter.title` (nullable, `VarChar(200)`).
