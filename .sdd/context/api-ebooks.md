# API de ebooks

> Atualizado em 2026-10-20 · fontes: `packages/backend/src/api/ebooks/**`

## O que é

A borda HTTP da estante: envia o ebook (guarda o arquivo, cria o livro e enfileira a ingestão), lista os livros com status, detalha um livro com a URL da capa e reenfileira quem falhou.

## Como funciona

- `EbooksController` (`ebooks.controller.ts`) expõe `POST /ebooks` (multipart, campo `file`, limite 50 MB via `FileInterceptor` com `diskStorage` em `tmpdir()`), `GET /ebooks`, `GET /ebooks/:id` e `POST /ebooks/:id/reprocess`; upload e reprocess respondem `202`, e o upload manda `Location: /ebooks/<id>`.
- Toda a regra fica nos services; o controller só valida a presença do arquivo e traduz request/response.
- `EbookUploadService` (`ebook-upload.service.ts`): valida vazio → formato pela extensão → hash SHA-256 lendo o temporário → checa duplicata por hash (`409` com o id existente) → `storage.put` com chave `<hash>.<ext>` → `create` do `Book` (removendo o objeto se o create falhar) → enfileira (compensando objeto + livro se a fila falhar) → apaga o temporário no `finally`.
- `EbookQueryService` (`ebook-query.service.ts`): listagem paginada (`page`, `pageSize` via Zod) mapeando `Book` → contrato **com `coverUrl` pré-assinada por item** (falha de um item vira `null` e não derruba a página) e detalhe com a mesma resolução de capa; qualquer falha do storage vira `coverUrl: null`.
- `EbooksExceptionFilter` (`ebooks-exception.filter.ts`) é registrado como `APP_FILTER` no `EbooksModule` e traduz erro de domínio para `{ statusCode, message }`: 404 (livro/objeto ausente), 409 (duplicata/status inválido), 413 (multer `LIMIT_FILE_SIZE`), 422 (formato/vazio/conteúdo/in put), 503 (storage/fila fora), 400 (sem arquivo/entrada inválida).

## Decisões e porquês

- **Upload responde antes de processar** — `202` + `Location`; a ingestão é assíncrona e o frontend acompanha pelo status.
- **Duplicata checada antes do storage** — a chave depende do formato (`<hash>.<ext>`), então o mesmo conteúdo em outro formato criaria objeto sem dono no bucket; o `create` ainda protege contra corrida.
- **Compensação em dois pontos** — falha do `create` remove só o objeto; falha de fila remove objeto + livro, para não deixar livro órfão no catálogo.
- **Filtro como `APP_FILTER`, não `@UseFilters`** — pega também o `MulterError`, que estoura no interceptor antes do handler, e recebe o `HttpAdapterHost` para o `super.catch`.
- **Capa nunca derruba o detalhe** — MinIO fora ou objeto sumido devolve `coverUrl: null`, com log de aviso.
- **Reprocess só de `failed`** — marca `pending` e reenfileira; outro status dá `409`.

## Notas

- O worker da ingestão cobre a corrida do reprocessamento: se o livro estiver `pending` no fim das tentativas, reenfileira em vez de marcar `failed` (o `enqueue` tinha deduplicado contra o job que morreu).
- Sem Redis configurado, o upload falha com `503` e a compensação desfaz livro + objeto.
- Smoke de API não deve subir `PrismaService`/BullMQ: use `TestingModule` com os services dublados.
