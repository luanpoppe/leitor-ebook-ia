# Infraestrutura local (Docker Compose)

> Atualizado em 2026-09-15 · fontes: `docker-compose.yml`, `.env.example`, `docker/minio/entrypoint.sh`, `package.json`

## O que é

Stack de desenvolvimento na raiz do monorepo: PostgreSQL com imagem pgvector, Redis e MinIO, parametrizada por `.env` na raiz. Sobe com `pnpm docker:up` (ou `docker compose up -d`).

## Como funciona

- **`.env.example`** documenta portas host (`5436`, `6380`, `9000`, `9001`), credenciais Postgres, URLs de conexão (`DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT`) e chaves MinIO (`MINIO_BUCKET=ebooks`). Copiar para `.env` (ignorado pelo git).
- **`docker-compose.yml`** interpola `${POSTGRES_PORT}`, `${REDIS_PORT}`, `${MINIO_API_PORT}`, `${MINIO_CONSOLE_PORT}` e credenciais. Três volumes nomeados (`postgres`, `redis`, `minio`), `restart: unless-stopped`, healthchecks em cada serviço.
- **Postgres** usa `pgvector/pgvector:pg16` — **sem** init SQL no Compose; extensão `vector` entra na primeira migration Prisma (`backend-core`).
- **MinIO** é container único: `docker/minio/entrypoint.sh` sobe `minio server`, espera API local, executa `mc mb local/${MINIO_BUCKET} --ignore-existing` e faz `wait` no PID do servidor. Sem serviço init separado.
- **`package.json` raiz**: `docker:up` → `docker compose up -d`; `docker:down` → `docker compose down` (sem `-v` — volumes persistem).

## Decisões e porquês

- Portas via `.env` — evita conflito com outros projetos na máquina; registradas em `Portas Usadas no PC.txt`. (origem: grill infra-local, 2026-09-14)
- Extensão `vector` no Prisma, não no Docker — preferência do usuário na revisão do chunk de init Postgres; `docker/postgres/init.sql` cancelado. (origem: F2.C2 desviado, 2026-09-15)
- MinIO container único com entrypoint — `MINIO_DEFAULT_BUCKETS` não existe na imagem oficial; `mc` embutido após o server subir. (origem: revisão F2.C3, 2026-09-15)
- `docker:down` sem `-v` — edge case da spec: dados preservados entre ciclos; `down -v` exige `prisma migrate` de novo e recria bucket MinIO.

## Notas

- Backend (`3026`) e frontend (`3027`) **não** estão no Compose — continuam via `pnpm dev`.
- Ao mudar `*_PORT` no `.env`, atualizar manualmente as URLs em `DATABASE_URL` / `REDIS_URL` / `MINIO_ENDPOINT` (não há interpolação cruzada no dotenv).
- Imagem MinIO pinada em `bitnamilegacy/minio:2025.7.23-debian-12-r5` (reprodutibilidade entre devs) — trocada na mudança `ingestao-ebooks`, porque `minio/minio` saiu do Docker Hub. Ver `.sdd/context/minio-local.md`.
