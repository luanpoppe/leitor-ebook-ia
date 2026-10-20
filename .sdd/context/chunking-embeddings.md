# Chunking e embeddings

> Atualizado em 2026-10-20 · fontes: `packages/backend/src/indexing/**`, `packages/backend/src/catalog/ebook-content.repository.ts`, `packages/backend/src/catalog/chunk-embedding.repository.ts`, `packages/backend/src/catalog/chunks.sql.ts`, `packages/backend/src/core/ai/embedding.constants.ts`, `prisma/schema.prisma`

## O que é

Divide o texto de cada capítulo em trechos pesquisáveis e gera o vetor de cada um no pgvector, para o chat RAG recuperar passagens do livro. É a etapa entre a extração e a ingestão orquestrada pela fila.

## Como funciona

- `TextChunker` (`src/indexing/text-chunker.ts`) divide cada capítulo em trechos de ~1.000 caracteres, juntando parágrafos e repetindo ~150 caracteres do fim no trecho seguinte. Parágrafo maior que o alvo é fatiado na janela de ~1.000 caracteres (orçamento já descontando o overlap), preferindo fim de frase; o limite rígido de 2.000 só vale para trecho sem espaço/pontuação. Chunks normais ficam ≤ ~1.000. `position` é sequencial dentro do capítulo.
- `EmbeddingService` (`embedding.service.ts`) chama `AIEmbeddings.embedDocuments` com o modelo `openrouter/openai/text-embedding-3-small` e `dimensions: 1536`, em lotes de 64. `embedBatch` faz uma chamada para um lote de até 64 textos; quem chama controla o loop, para poder persistir o parcial entre lotes. Sem `OPENROUTER_API_KEY` (ou client nulo) lança `EmbeddingUnavailableError`.
- `ContentIndexingService` (`content-indexing.service.ts`) orquestra:
  - `prepare(chapters)` chunka, vetoriza lote a lote **acumulando** o que deu certo e devolve `chapters` + `embedded` + `remaining` + `error`. Falha de embedding não lança.
  - `resumeMissing(bookId)` lê os trechos sem vetor (`ChunkEmbeddingRepository.findChunksWithoutEmbedding`), vetoriza e **grava cada lote antes do próximo** (`updateChunkEmbeddings`). Devolve `embedded` + `remaining` + `total`; `total` é a contagem de chunks do livro e existe para a pipeline aplicar `ready = total > 0 && remaining === 0` (livro sem chunks não é "pronto"). Lista vazia não chama a API.
  - `incompleteMessage(remaining)` gera a mensagem de erro para o `failed`.
- `chunks.embedding` é nulável: `NULL` = trecho gravado e ainda sem vetor. O índice HNSW só indexa não-nulos; qualquer busca por similaridade deve filtrar `embedding IS NOT NULL` para não devolver distância nula.
- `EbookContentRepository` (`src/catalog/ebook-content.repository.ts`): `replaceContent` transacional (lock, delete/recreate). A retomada vive em `ChunkEmbeddingRepository` (`src/catalog/chunk-embedding.repository.ts`): `findChunksWithoutEmbedding`, `countChunksWithoutEmbedding`, `countChunks` e `updateChunkEmbeddings` (guarda `embedding IS NULL`). Os builders de SQL de chunk ficam em `ChunkSql` (`src/catalog/chunks.sql.ts`).
- `IndexingModule` provê `EmbeddingService` e `ContentIndexingService` (exporta só o segundo), importando `CatalogModule`; registrado no `AppModule`.

## Decisões e porquês

- **Chunk de ~1.000 caracteres por parágrafo, com overlap de ~150** — preserva fronteira semântica e mantém contexto na fronteira; cortar no meio de frase piora a recuperação.
- **`chunks.embedding` nulável** — consequência de gravar parcial: sem a coluna nulável, o trecho sem vetor não pode ser persistido.
- **Sem índice novo para a retomada** — `book_id` + `UNIQUE(chapter_id, position)` resolvem ~5.000 trechos em milissegundos; índice parcial oneraria a escrita no caminho mais quente.
- **Modelo prefixado `openrouter/...`** — o SDK roteia pelo prefixo; sem ele cai na rota nativa da OpenAI, que não tem chave no projeto.
- **Falha por lote, nunca tudo-ou-nada** — o CT-03 exige que os embeddings já pagos fiquem gravados; por isso `prepare` acumula e `resumeMissing` grava por lote.
- **Retomada não chama `replaceContent`** — o `deleteMany` de capítulos levaria os chunks em cascade e apagaria os vetores pagos.
- **Repositório dividido (book vs conteúdo)** — o arquivo original tinha 476 linhas; a divisão respeita o limite do projeto sem mudar comportamento.

## Notas

- A validação de dimensão (1.536 e finitos) aparece em `assertValidEmbedding` nos dois repositórios — duplicação consciente (2 ocorrências).
- A dimensão 1.536 vive em `src/core/ai/embedding.constants.ts`, compartilhada entre o serviço de embedding e a validação do repositório.
- Um retry que precise preservar vetores deve usar `resumeMissing`; `replaceContent` é só para re-criar o conteúdo do zero.
- Sem `OPENROUTER_API_KEY`, a indexação falha com mensagem própria e o livro fica `failed` (o conteúdo extraído pode ser preservado pelo pipeline).
- O repositório de conteúdo foi dividido no code review (`F5.C7`): conteúdo, retomada e SQL puro em arquivos separados; a validação de embedding é duplicada nos dois (2 ocorrências, dentro do limite da regra de DRY).
