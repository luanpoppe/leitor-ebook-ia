---
# Spec: API de capítulos

> Parte de [`leitor-ebooks`](../../plan.md)

## Resumo

Duas rotas de leitura para o leitor: o sumário de um livro pronto (posição, título e contagem de palavras) e o conteúdo de um capítulo, paginado por offset para não estourar com capítulos gigantes.

## Histórias do usuário

### HU-1: Sumário do livro

> **Como** leitor, **quero** ver o sumário com títulos e tamanho de cada capítulo, **para** escolher por onde começar sem abrir o livro inteiro.

#### CT-01: Livro pronto lista todos os capítulos

- **Dado que** `dom-casmurro.epub` está `ready` com 3 capítulos
- **Quando** o leitor pede `GET /ebooks/{id}/chapters`
- **Então** recebe os 3 capítulos em ordem de posição
- **E** cada item traz `position`, `title` e `wordCount`
- **E** o primeiro item tem `title` "Capítulo I — O Rio de Janeiro" e `wordCount` maior que zero

#### CT-02: Livro em preparo não abre

- **Dado que** um livro está `processing`
- **Quando** o leitor pede o sumário
- **Então** a API responde `409`
- **E** a mensagem diz que o livro ainda está em preparo

#### CT-03: Livro inexistente

- **Dado que** o id não existe
- **Quando** o leitor pede o sumário
- **Então** a API responde `404`

### HU-2: Ler um capítulo

> **Como** leitor, **quero** abrir um capítulo e receber o texto, **para** ler e continuar de onde parei.

#### CT-04: Capítulo existente devolve texto e vizinhos

- **Dado que** `dom-casmurro.epub` está pronto
- **Quando** o leitor pede `GET /ebooks/{id}/chapters/2`
- **Então** recebe o texto do capítulo 2
- **E** recebe `previousPosition: 1` e `nextPosition: 3`
- **E** `nextOffset` é `null` porque o capítulo coube na página

#### CT-05: Posição fora do livro

- **Dado que** o livro tem 3 capítulos
- **Quando** o leitor pede a posição 4
- **Então** a API responde `404`
- **E** a mensagem cita a posição pedida

#### CT-06: Capítulo grande vem em páginas

- **Dado que** um TXT virou um capítulo único de 120.000 caracteres
- **Quando** o leitor pede a primeira página
- **Então** recebe no máximo 50.000 caracteres
- **E** `nextOffset` aponta para o caractere seguinte
- **E** pedir a última página devolve `nextOffset: null`

## Edge cases

- Livro `ready` sem capítulos → sumário `{ "items": [] }`  ||  não é erro
- `offset` além do fim do texto → `text` vazio e `nextOffset: null`  ||  não é erro
- `limit` acima de 100.000 → `400` pela validação
- `position` zero ou negativa → `400` pela validação
- Livro `failed` → mesmo `409` de "não pronto"
- Capítulo com título nulo → `title: null`  ||  a tela decide o fallback

## Notas técnicas

### NT-1: Contagem de palavras

`wordCount` é calculado no banco, sem transferir o texto (sustenta HU-1). Conta tokens separados por espaço em branco.

```sql
-- entra (chapters.text)
'CAPÍTULO I\n\nO Rio de Janeiro...'
-- sai
{ "position": 1, "title": "Capítulo I", "wordCount": 4210 }
```

- **Texto só com espaços** → não existe por invariante; a contagem nunca recebe string vazia.

### NT-2: Paginação por offset

Offset e limite são contados em **caracteres** (code points), como o `substr` do Postgres (sustenta HU-2).

```http
GET /ebooks/0192f3a0-.../chapters/1?offset=0&limit=50000
```

```json
{
  "position": 1,
  "title": "Capítulo I",
  "text": "CAPÍTULO I\n\nO Rio de Janeiro...",
  "offset": 0,
  "limit": 50000,
  "nextOffset": 50000,
  "totalLength": 120000,
  "previousPosition": null,
  "nextPosition": 2
}
```

- **offset ≥ totalLength** → `text: ""` e `nextOffset: null`.
- **limit fora de 1..100000** → `400`.

### NT-3: Contrato das rotas

- `GET /ebooks/:bookId/chapters` → `{ items: [{ id, position, title, wordCount }] }`
- `GET /ebooks/:bookId/chapters/:position?offset=0&limit=50000` → o payload da NT-2.
- `position` 1-based; `offset` padrão 0; `limit` padrão 50000 e máximo 100000.
- Erros traduzidos pelo filtro atual: `404` livro/capítulo, `409` livro não pronto, `400` validação.

## Contratos expostos

- `EbookChaptersController` — `packages/backend/src/api/ebooks/ebook-chapters.controller.ts` (rotas `GET /ebooks/:bookId/chapters` e `GET /ebooks/:bookId/chapters/:position`).
- DTOs de entrada — `packages/backend/src/api/ebooks/chapters.schemas.ts:ChapterPageQueryDto` e `ChapterPositionParamsDto`.
---
