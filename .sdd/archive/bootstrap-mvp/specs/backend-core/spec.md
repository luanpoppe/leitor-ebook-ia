# Spec: Backend base

> Parte de [`bootstrap-mvp`](../../plan.md)

## Resumo

Módulos base do backend NestJS: configuração validada por zod, endpoints de saúde, Prisma com a extensão pgvector, BullMQ sobre o Redis existente e os clients de MinIO e de IA (`@luanpoppe/ai` + OpenRouter). Nada além dos endpoints de saúde é exposto nesta feature — sem domínio, sem chat.

## Requirements

### REQ-1: Backend sobe com a infra no ar

- **Dado que** o `.env` está configurado e Postgres, Redis e MinIO estão de pé
- **Quando** o desenvolvedor sobe o backend
- **Então** o app escuta na porta `3026`
- **E** `GET /health` responde `200` com `{ "status": "ok" }`
- **E** `GET /health/ready` responde `200` com as três dependências `ok`

### REQ-2: Readiness acusa dependência fora

- **Dado que** o app está no ar
- **Quando** uma das dependências fica indisponível
- **Então** o `GET /health/ready` responde `503`
- **E** o corpo nomeia qual das três (database, redis, storage) falhou
- **E** `GET /health` continua respondendo `200`

### REQ-3: Boot falha rápido sem a config essencial

- **Dado que** `DATABASE_URL` não está definida
- **Quando** o app inicia
- **Então** o boot aborta com erro nomeando `DATABASE_URL`
- **E** o processo não chega a escutar a porta

### REQ-4: Config tipada e validada

- **Entrada** `process.env` sem `PORT` e sem `OPENROUTER_API_KEY`
- **Saída** `{ PORT: 3026, openRouterApiKey: undefined }`
- **E** `DATABASE_URL`, `REDIS_URL` e `MINIO_*` são lidos como string quando presentes
- **Erro** variável essencial ausente → lança no boot, nomeando a variável

### REQ-5: Primeira migration habilita pgvector

- **Entrada** `prisma migrate deploy` contra o banco `leitor_ebook_ia` vazio
- **Saída** extensão `vector` instalada
- **E** schema Prisma sem models — nenhuma tabela de domínio
- **Erro** migration já aplicada → reexecutar é no-op  ||  usa `IF NOT EXISTS`

### REQ-6: Clients de IA e MinIO montados do env

- **Entrada** `MINIO_ENDPOINT`, credenciais e `OPENROUTER_API_KEY` do ambiente
- **Saída** provider de MinIO configurado e client de IA injetável
- **E** `OPENROUTER_API_KEY` ausente → provider sobe sem provedor de IA  ||  não lança no boot
- **E** nenhum endpoint de IA ou de arquivo é exposto nesta feature

### REQ-7: Módulo de filas sobre o Redis existente

- **Entrada** `REDIS_URL` do ambiente
- **Saída** conexão Redis compartilhada e um módulo de filas reutilizável
- **E** nenhuma fila concreta é criada nesta feature
- **Erro** Redis fora no boot → log de aviso, HTTP continua servindo

## Edge cases

- Infra fora no boot (URLs válidas, serviço parado): o app sobe e serve `/health`; `/health/ready` fica `503` até a dependência voltar.
- Chave de IA ausente não impede o boot; o erro só apareceria se algo tentasse usar a IA — nada nesta feature tenta.
- Clientes (Prisma, Redis, MinIO) instanciados uma vez por processo, via módulo global, não por request.

## Contratos expostos

- `GET /health` → `200 { "status": "ok" }`  ||  já existe: `packages/backend/src/app.controller.ts:AppController.health`.
- `GET /health/ready` → novo e provisório:
  - `200 { "status": "ok", "checks": { "database": "ok", "redis": "ok", "storage": "ok" } }`
  - `503 { "status": "error", "checks": { "database": "ok", "redis": "error", "storage": "ok" } }`
