# Pipeline de ingestão

> Atualizado em 2026-10-20 · fontes: `packages/backend/src/ingestion/**`

## O que é

O caminho assíncrono que transforma o arquivo enviado em livro pesquisável: a fila recebe o id do livro, o worker baixa o arquivo do storage, extrai o conteúdo, chunka/vetoriza e atualiza o status — com retry e sem repetir o que já foi feito.

## Como funciona

- `IngestionQueue` (`ingestion.queue.ts`) enfileira `{ bookId }` na fila `ebook-ingestion` com `jobId = bookId`, 3 tentativas e backoff exponencial a partir de 5s; sem Redis configurado lança `QueueUnavailableError`.
- `IngestionProcessor` (`ingestion.processor.ts`) sobe o `Worker` do BullMQ no mesmo processo (`concurrency: 1`) quando há conexão Redis. Cada job vai para `IngestionService.process`.
- `IngestionService` (`ingestion.service.ts`) marca `processing` e escolhe o estágio:
  - **sem capítulos** → baixa o arquivo do storage, `ContentExtractor.extract`, `ContentIndexingService.prepare`, `replaceContent` (gravando título/autor/capa) e, se sobrar trecho sem embedding, grava o parcial e lança `IncompleteIndexingError`;
  - **com capítulos** → `resumeMissing(bookId)`, sem baixar nem extrair de novo; livro com `total = 0` também falha.
  - sucesso → `ready`.
- O worker decide o status final: `EbookNotFoundError` vira `UnrecoverableError` (sem retry); nas outras falhas, `failed` com a mensagem só na última tentativa, e o erro é relançado para o BullMQ contar.
- `IngestionModule` liga catálogo, storage, extração e indexação; registrado no `AppModule`, então o worker sobe com a API.

## Decisões e porquês

- **`jobId = bookId`** — o BullMQ descarta duplicata enquanto o job está na fila/ativo.
- **3 tentativas com backoff 5s/30s/2min** — cobre falha transitória de IA/Redis sem prender o job.
- **Worker no mesmo processo** — menos infra para a entrega atual; separar depois é só um entrypoint.
- **Retomada por estágio** — evita repagar extração e embeddings: sem capítulos reextrai, com capítulos só completa vetores.
- **`failed` só na última tentativa** — entre tentativas o livro continua `processing`, sem piscar erro para o leitor.
- **Livro inexistente é definitivo** — repetir não cria o registro; não gasta as tentativas.
- **Reprocess pedido durante o job é honrado** — se o livro está `pending` no fim das tentativas, o worker reenfileira em vez de marcar `failed`, porque o `enqueue` do reprocess deduplicou contra o job que acabou de morrer.

## Notas

- `prepare` grava o parcial antes de lançar `IncompleteIndexingError`; o retry passa a usar `resumeMissing`.
- A mensagem de `failed` é a do erro de origem (extração, IA ou `Indexação incompleta: N trechos sem embedding.`).
- Sem `REDIS_URL`, a API sobe e a fila responde `QueueUnavailableError`; o worker não é criado.
