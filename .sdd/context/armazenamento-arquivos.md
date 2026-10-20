# Armazenamento de arquivos

> Atualizado em 2026-10-20 · fontes: `packages/backend/src/storage/**`, `packages/backend/src/core/storage/**`

## O que é

Operações de objeto no MinIO (subir, baixar e remover) no bucket `ebooks`, para guardar o arquivo original do ebook e entregá-lo ao leitor. A chave é content-addressed pelo hash e a leitura no browser usa URL pré-assinada.

## Como funciona

- `FileStorageService` (`src/storage/file-storage.service.ts`) injeta `MINIO_CLIENT` (do `StorageModule` global) e `EnvService` (bucket, com fallback `ebooks`).
- `put`: valida o hash SHA-256, monta a chave `<hash>.<ext>` (ext do formato) e grava o stream com `Content-Type` por formato.
- `get`: `getObject` → devolve o stream; o 404 (`NoSuchKey`) do SDK vira `StorageObjectNotFoundError`. O `statObject` só é usado no `getPresignedUrl`, porque assinar não checa existência.
- `getPresignedUrl`: `statObject` + `presignedGetObject` com 3600s.
- `remove`: idempotente — 404 do S3 é tratado como sucesso.
- Erros de domínio: `StorageUnavailableError` (client `null`), `StorageObjectNotFoundError`, `InvalidStorageInputError`.
- `FileStorageModule` provê/exporta o serviço; importado no `AppModule`.

## Decisões e porquês

- **URL pré-assinada de 1 hora** em vez de proxy — o browser baixa direto do MinIO, sem o backend carregar o tráfego do arquivo. (grill ingestao-ebooks, 2026-10-20)
- **Streams em vez de buffers** — um arquivo grande não ocupa memória por requisição. (grill)
- **Chave content-addressed `<hash>.<ext>`** — o mesmo conteúdo gera a mesma chave, alinhado ao dedupe por hash do catálogo. (grill)
- **Remoção idempotente** — retry e reprocessamento não falham por o objeto já não existir. (grill)
- **`Content-Type` nos metadados** — a URL pré-assinada serve o tipo certo ao browser. (delta)
- **Bucket do `EnvService` com fallback** — `MINIO_BUCKET`, caindo para `ebooks`. (F3.C1)

## Notas

- O `getObject` pode emitir erro **depois** da promise (no stream); isso não é mascarado de propósito.
- Não há validação de tamanho/limite aqui — é responsabilidade da API de upload (`F7`).
- O bucket é criado pelo entrypoint do MinIO (`minio-local`).
