# Backend base

> Atualizado em 2026-10-14 · fontes: `packages/backend/src/core/**`, `prisma/schema.prisma`, `prisma.config.ts`

## O que é

Fundação do backend NestJS: configuração tipada, acesso a banco (Prisma 7), filas (BullMQ sobre o Redis), clientes de IA (`@luanpoppe/ai`) e MinIO, e os endpoints de saúde. Sem domínio, sem autenticação.

## Como funciona

- **`EnvService`** (global, via `CoreModule`) valida `process.env` com zod no boot: `DATABASE_URL` obrigatória; `PORT` (default 3026), `REDIS_URL`, `MINIO_*` e `OPENROUTER_API_KEY` opcionais.
- **`AppModule`** faz `ConfigModule.forRoot({ envFilePath: [join(cwd, '../../.env'), '.env'] })` — o `.env` mora na **raiz** do monorepo, mas o backend roda com cwd `packages/backend`.
- **`CoreModule`** (`@Global`) importa e instancia `PrismaModule`, `QueueModule`, `AiModule`, `StorageModule`, `HealthModule`; provê/exporta o `EnvService`.
- **Prisma**: client gerado em `src/generated/prisma` (gitignored) via `prisma generate` (no `postinstall` e antes de `dev`/`build`); datasource **sem url** — a url vive em `prisma.config.ts`; conexão pelo driver adapter `PrismaPg`; extensão `vector` habilitada por migration customizada.
- **`QueueModule`**: conexão ioredis compartilhada (token `REDIS_CONNECTION`, `null` se `REDIS_URL` ausente) com teardown no destroy; sem fila concreta ainda.
- **`AiModule`**: client `@luanpoppe/ai` (token `AI_CLIENT`, `null` sem `OPENROUTER_API_KEY`); modelo default `openrouter/deepseek/deepseek-v4-flash` (constante hardcoded).
- **`StorageModule`**: client MinIO (token `MINIO_CLIENT`), desmonta `MINIO_ENDPOINT` em host/porta/ssl; sem operação de bucket.
- **`HealthModule`**: `GET /health` (liveness) e `GET /health/ready` (200/503, sondando Postgres, Redis e MinIO em paralelo, timeout de 2s).

## Decisões e porquês

- **Prisma 7** — url no `prisma.config.ts`, generator `prisma-client` (CJS) em `src/generated/prisma`, driver adapter `@prisma/adapter-pg`. (origem: grill backend-core, 2026-10-14)
- **Extensão `vector` via migration customizada** — a preview `postgresqlExtensions` foi deprecada. (origem: F3.C2/C3)
- **Readiness separado do liveness** — `/health/ready` checa DB+Redis+MinIO; a IA fica fora (custo/latência). (origem: grill backend-core)
- **Env fail-fast só em `DATABASE_URL`** — o app sobe sem Redis/MinIO/IA; cada provider devolve `null` com aviso quando não configurado. (origem: grill backend-core)
- **`CoreModule` é `@Global`** — para o `EnvService` alcançar os providers dos cinco módulos (o `@Global()` na classe do provider não tem efeito). (origem: F3.C10)

## Notas

- Endpoints: `GET /health`, `GET /health/ready`; `GET /` redireciona 302 para `/api` (Swagger).
- O readiness depende do MinIO; na validação a imagem `minio/minio` **não pullou** — investigar (feature `infra-local`).
- Rodar: `pnpm docker:up` (infra) + `pnpm dev` (backend 3026 + frontend 3027).
