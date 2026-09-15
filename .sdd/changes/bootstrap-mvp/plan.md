# Fundação do monorepo e infraestrutura local

> **id**: `bootstrap-mvp` · **criada**: 2026-09-14 · **idioma**: pt-BR

## Contexto

Primeira mudança do leitor de ebooks com IA. O objetivo é ter um monorepo pnpm funcional com backend NestJS e frontend Next.js, infraestrutura local para desenvolvimento (PostgreSQL com pgvector, Redis, armazenamento de arquivos) e os módulos base de cada camada — sem autenticação, sem leitor EPUB e sem RAG ainda.

## Decisões macro

- **Monorepo pnpm**: estrutura a partir do template em `luan-templates/pnpm`, com backend NestJS e frontend Next.js Tailwind populados via **sync one-shot local** (scripts do template executados uma vez e removidos — não versionados). **Por quê**: reutilizar scaffold existente sem manter tooling de sync no repo. **Alternativa descartada**: criar monorepo do zero.
- **ORM Prisma**: acesso a dados no backend NestJS. **Por quê**: DX e migrações simples.
- **Sem autenticação nesta mudança**: modo usuário único/dev. **Por quê**: reduz escopo da fundação; auth entra numa mudança futura.
- **IA via `@luanpoppe/ai` + OpenRouter**: biblioteca npm do usuário como camada de provedor. **Por quê**: reutilizar abstração existente; nesta mudança só prepara integração (config/módulo), sem chat RAG.
- **Infra local em Docker Compose**: PostgreSQL (pgvector), Redis, MinIO. **Por quê**: dependências necessárias para ingestão e filas nas próximas mudanças.
- **Frontend web apenas**: Next.js responsivo; mobile/desktop nativos ficam fora.

## Features (executadas sequencialmente)

1. **scaffold-monorepo** — Bootstrap do monorepo pnpm com `packages/backend` (NestJS) e `packages/frontend` (Next.js).
2. **infra-local** — Docker Compose para PostgreSQL/pgvector, Redis e MinIO com variáveis de ambiente documentadas.
3. **backend-core** — Módulos base NestJS: config, health, Prisma, BullMQ e wiring inicial de `@luanpoppe/ai`.
4. **frontend-core** — Shell Next.js com layout, TanStack Query e cliente HTTP para a API.

## Escopo

**Dentro**: estrutura monorepo, scripts `dev`, docker-compose dev, schema Prisma inicial mínimo, módulos base backend/frontend, integração stub da lib de IA.

**Fora**: autenticação, upload de EPUB, pipeline de ingestão, leitor epub.js, destaques, chat RAG, modo sem spoilers, PDF, PWA, mobile, desktop.
