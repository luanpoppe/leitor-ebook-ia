# Spec: MinIO local

> Parte de [`ingestao-ebooks`](../../plan.md)

## Resumo

Destravar o object storage de desenvolvimento. A imagem `minio/minio` saiu de distribuição pública (Docker Hub, Quay e `dl.min.io`), então o Compose passa a usar `bitnamilegacy/minio` — a mesma engine MinIO — com tag pinada, mantendo o container único que sobe o servidor e garante o bucket `ebooks`.

## Requirements

### REQ-1: Desenvolvedor sobe o object storage

- **Dado que** o `.env` da raiz está configurado com as chaves `MINIO_*`
- **Quando** o desenvolvedor roda `pnpm docker:up`
- **Então** o container MinIO sobe com a API na porta `9000` e o console na `9001`
- **E** o container fica `healthy`
- **E** o bucket `ebooks` existe no servidor

### REQ-2: Imagem substituída e pinada

- **Entrada** `image: minio/minio:RELEASE.2025-09-07T16-13-09Z` no `docker-compose.yml`
- **Saída** `image: bitnamilegacy/minio:2025.7.23-debian-12-r5` (mesma engine, tag pinada para reprodutibilidade)
- **Erro** tag indisponível/inexistente → `docker compose up` falha com erro explícito de pull, em vez de subir outro serviço

### REQ-3: Entrypoint adaptado à imagem Bitnami

- **Entrada** `docker/minio/entrypoint.sh` chamando `minio` e `mc` pelo PATH e usando `/data` como diretório de dados
- **Saída** invoca os binários da imagem (`/opt/bitnami/minio/bin/minio`, `/opt/bitnami/minio-client/bin/mc`) e usa um diretório de dados gravável pelo usuário `1001`
- **Erro** binário fora do PATH ou diretório sem permissão → o entrypoint falha antes de criar o bucket

### REQ-4: Bucket garantido de forma idempotente

- **Entrada** `MINIO_BUCKET=ebooks` e o volume já contendo o bucket (segundo `docker compose up`)
- **Saída** a criação usa `--ignore-existing` e o container segue de pé com o bucket disponível
- **Erro** criação sem `--ignore-existing` num bucket existente → exit ≠ 0 e o container entra em restart loop

### REQ-5: Healthcheck usa o `mc` da imagem

- **Entrada** `healthcheck.test` do serviço `minio` no Compose
- **Saída** resolve o `mc` da imagem (PATH ou caminho absoluto) e valida `mc ready` mais `mc stat` no bucket `ebooks`
- **Erro** `mc` não encontrado no healthcheck → container marcado `unhealthy` permanentemente

## Edge cases

- Volume `minio` de execuções anteriores já tem o bucket → `mc mb --ignore-existing` não falha.
- A tag pinada pode sair do repo legacy no futuro → `docker compose up` falha com erro de pull; corrigir é trocar a tag.
- Diretório de dados montado num caminho não gravável pelo usuário `1001` → container reinicia; o volume precisa apontar para o caminho de dados do Bitnami.

## Contratos expostos

- Serviço `minio` no Compose: API em `9000`, console em `9001`, bucket `ebooks` — já existente, em `docker-compose.yml` e `.env.example` (raiz do repo).
