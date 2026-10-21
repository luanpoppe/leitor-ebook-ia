# Spec: Armazenamento de arquivos

> Parte de [`ingestao-ebooks`](../../plan.md)

## Resumo

Operações de objeto no MinIO (subir, baixar, remover) sobre o `StorageModule` existente, no bucket `ebooks`. A chave do objeto é content-addressed pelo hash do arquivo e a leitura no browser usa URL pré-assinada.

## Requirements

### REQ-1: Subir o arquivo original

- **Entrada** stream do arquivo, tamanho em bytes, hash SHA-256 (`a3f1c9…`) e formato (`epub|pdf|txt|md`)
- **Saída** objeto gravado no bucket `ebooks` na chave `<hash>.<ext>`, com `Content-Type` do formato
- **E** a operação devolve a `storageKey`
- **Erro** MinIO desconfigurado → `StorageUnavailableError`

### REQ-2: Baixar o arquivo

- **Entrada** `storageKey` (`a3f1c9….epub`)
- **Saída** stream do objeto
- **Erro** objeto inexistente → `StorageObjectNotFoundError`

### REQ-3: URL pré-assinada para o browser

- **Entrada** `storageKey`
- **Saída** URL de GET válida por 1 hora, para o browser baixar direto do MinIO
- **Erro** objeto inexistente → `StorageObjectNotFoundError`

### REQ-4: Remover o arquivo (idempotente)

- **Entrada** `storageKey`
- **Saída** objeto removido
- **E** se o objeto não existia, a operação retorna sucesso
- **Erro** MinIO desconfigurado → `StorageUnavailableError`

### REQ-5: Chave content-addressed

- **Entrada** hash `a3f1c9…` e formato `epub`
- **Saída** `storageKey` igual a `a3f1c9….epub`
- **Erro** hash vazio ou fora do formato SHA-256 hexadecimal → `InvalidStorageInputError`

### REQ-6: Subir o mesmo conteúdo de novo

- **Entrada** `put` do mesmo hash de novo
- **Saída** o objeto existente é sobrescrito (mesmo conteúdo) e a mesma `storageKey` é devolvida
- **E** não existe objeto duplicado no bucket

## Edge cases

- MinIO desconfigurado (`MINIO_CLIENT` é `null`) → a operação lança `StorageUnavailableError`, nunca um erro de `null` do SDK.
- Objeto inexistente em `get`/`getPresignedUrl` → `StorageObjectNotFoundError`; em `remove`, sucesso.
- MinIO fora do ar no meio da operação → o erro do SDK é propagado com log; nada é mascarado como sucesso.
- `storageKey` vazia em `get`/`remove` → `InvalidStorageInputError`, sem chamar o MinIO.

## Contratos expostos

- `FileStorageService` (novo; provisório até o chunk): `put`, `get`, `getPresignedUrl` e `remove`.
- Formato da chave: `<hash>.<ext>`, com `<ext>` derivada do formato do ebook.
- Bucket: `MINIO_BUCKET` (já em `.env.example`).
