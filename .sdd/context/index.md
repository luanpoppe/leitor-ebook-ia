# Contexto do projeto — leitor-ebook-ia

> Como as funcionalidades do projeto funcionam (macro + decisões). Mantido pelos fluxos lp:* e por lp:context. LIDO no início de todo fluxo.

## Áreas / funcionalidades

- [scaffold-monorepo](./scaffold-monorepo.md) — monorepo pnpm, backend NestJS, frontend Next.js
- [infra-local](./infra-local.md) — Docker Compose (Postgres pgvector, Redis, MinIO), `.env` e scripts `pnpm docker:up`/`down`
- [backend-core](./backend-core.md) — módulos NestJS base: config tipada, Prisma 7, BullMQ/Redis, IA, MinIO e health/readiness.
