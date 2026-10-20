# Catálogo de ebooks

> Atualizado em 2026-10-20 · fontes: `packages/backend/prisma/schema.prisma`, `prisma/migrations/20261020004742_create_ebook_catalog/`, `src/catalog/**`

## O que é

O modelo de domínio e a persistência da ingestão: o registro do ebook com o ciclo de status, os capítulos extraídos e os trechos (chunks) com o embedding vetorial. É a base que o worker grava e que a API e a tela consultam.

## Como funciona

- Tabelas `books`, `chapters` e `chunks` (Prisma 7; migration `20261020004742_create_ebook_catalog`).
- `books`: título, formato (`epub|pdf|txt|md`), tamanho, hash SHA-256 **único**, `storage_key`, status (`pending|processing|ready|failed`), `error_message` (só em `failed`), timestamps com fuso.
- `chapters`: posição 1-based e texto; FK em cascata para `books`; `UNIQUE(book_id, position)`.
- `chunks`: posição, texto e `embedding vector(1536)` **nulável** (NULL = trecho persistido ainda sem vetor, desde o chunking); FK em cascata para `chapters`; `UNIQUE(chapter_id, position)`; índice HNSW com `vector_cosine_ops`.
- `EbookRepository` (`src/catalog/ebook.repository.ts`): só o book — `create` (P2002 → `DuplicateEbookError` com o id existente), `findById`, `findByHash`, `list` (`createdAt desc, id desc`) e `updateStatus` (mensagem só em `failed`).
- `EbookContentRepository` (`src/catalog/ebook-content.repository.ts`): o conteúdo — `replaceContent` transacional e a retomada dos embeddings (`findChunksWithoutEmbedding`, `countChunksWithoutEmbedding`, `updateChunkEmbeddings`). Tipos em `ebook-content.types.ts`.
- `replaceContent`: trava a linha do book (`SELECT ... FOR UPDATE`), apaga os capítulos (cascade leva os chunks) e regrava; sem capítulos, sintetiza um na posição 1 com `fullText`; chunks entram por SQL bruto.
- `updateChunkEmbeddings`: um `UPDATE ... FROM (VALUES ...)` por lote, com guarda `embedding IS NULL` — repetir a chamada não sobrescreve vetor já gravado.
- `CatalogModule` provê e exporta o repositório; o `PrismaService` vem do `CoreModule` global.
- A coluna `embedding` é `Unsupported` no Prisma — não existe no Client; a escrita usa SQL parametrizado. As PKs uuid v7 são geradas pelo Prisma Client; em SQL puro o id é passado explícito (`gen_random_uuid()` nos chunks).

## Decisões e porquês

- **UUID v7 nas PKs** — id exposto em URL, sem enumeração, com ordenação temporal aproximada. (grill, 2026-10-20)
- **Hash único como dedupe** — o mesmo conteúdo não é reprocessado nem duplica storage; a API responde 409 com o id existente. (grill)
- **Chunk ligado só ao capítulo** — filtro por ebook via join; sem redundância. (grill)
- **`vector(1536)` fixo** — dimensão do modelo de embedding do projeto. (grill)
- **Reprocessamento atômico com lock da linha** — a última transação que commita vence; falha no meio faz rollback. (grill + modelagem)
- **Sempre ≥1 capítulo é invariante da aplicação** — um book `pending` legitimamente tem zero; a transação que grava garante o mínimo. (grill)
- **Enum nativo para status/formato** — conjunto fechado, validado no banco. (modelagem F2.C1)
- **Índice HNSW no SQL** — o Prisma não modela `hnsw`; é drift conhecido. (F2.C1)

## Notas

- Um `prisma migrate dev` futuro pode propor **dropar** o índice HNSW (não modelado no schema); recriá-lo depois de rodar migrations.
- Insert de chunk em SQL puro precisa informar o id; `embedding` vai como literal textual `[0.1,0.2,...]` com cast `::vector`.
- Os repositórios foram divididos no `F5.C4` (book vs. conteúdo) para respeitar o limite de ~250 linhas; `ebook-content.repository.ts` tem ~380 e é o próximo candidato a split (extrair o SQL puro).
- A retomada **não pode** chamar `replaceContent`: o `deleteMany` de capítulos levaria os chunks (cascade) e apagaria os embeddings já pagos.
