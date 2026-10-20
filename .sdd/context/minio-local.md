# MinIO local (object storage de dev)

> Atualizado em 2026-10-18 · fontes: `docker-compose.yml`, `docker/minio/entrypoint.sh`, `specs/minio-local/spec.md`

## O que é

O object storage S3-compatible de desenvolvimento (bucket `ebooks`), onde fica o arquivo original dos ebooks. Sobe junto da infra local pelo `pnpm docker:up`.

## Como funciona

- O serviço `minio` no `docker-compose.yml` usa a imagem `bitnamilegacy/minio:2025.7.23-debian-12-r5` (tag pinada): API em `9000`, console em `9001`.
- O `docker/minio/entrypoint.sh` (montado como `/entrypoint.sh`) substitui o entrypoint da imagem: prefixa o PATH com os diretórios do Bitnami, sobe `minio server` em background, espera a API responder a um `mc alias set` e cria o bucket `ebooks` com `mc mb --ignore-existing` (idempotente); termina em `wait` no processo do server.
- O volume nomeado `minio-bitnami` é montado em `/bitnami/minio/data` (diretório de dados do Bitnami), com `MINIO_DATA_DIR` explícito no serviço.
- A imagem roda como usuário `1001` (gid 0).
- O healthcheck faz `mc alias set` + `mc ready` + `mc stat` no bucket — valida que a API responde e que o bucket existe.

## Decisões e porquês

- **Imagem `bitnamilegacy/minio`** — o repositório `minio/minio` foi removido do Docker Hub (e do Quay, e `dl.min.io` responde 410). O `bitnamilegacy` mantém a mesma engine MinIO. (origem: grill ingestao-ebooks, 2026-10-18)
- **Container único com `mc mb`** — mantida a abordagem da infra-local (sem serviço init), agora adaptada aos caminhos e ao usuário do Bitnami. (origem: grill ingestao-ebooks)
- **Healthcheck inalterado** — a imagem Bitnami já traz o `mc` no PATH, então o container sobe `healthy` sem mudança; o chunk que ajustaria o healthcheck foi removido por virar no-op. (origem: F1.C1, 2026-10-18)
- **Sem LocalStack/outro S3** — avaliado e descartado (mais pesado e mudaria o cliente do backend). (origem: grill ingestao-ebooks)
- **Variáveis seguem `MINIO_*`** — a engine continua sendo MinIO. (origem: grill ingestao-ebooks)

## Notas

- O volume foi renomeado para `minio-bitnami` de propósito: um volume criado pela imagem antiga (`minio/minio`, rodava como root) não é gravável pelo usuário `1001` do Bitnami. Com o nome novo, o upgrade nasce num volume limpo e com a posse correta; o volume antigo `minio` fica órfão e pode ser removido com `docker volume rm <projeto>_minio`. (Achado A1 do code review, corrigido.)
