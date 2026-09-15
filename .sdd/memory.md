# Memória do SDD

> Preferências e decisões recorrentes deste projeto. Mantida pelo `lp:continue`. Edite manualmente se quiser.

## Estilo / Processo

<!-- Como o agente deve trabalhar. Carrega SEMPRE. Não pré-supõe nada sobre features. -->

(vazio — entradas serão adicionadas conforme decisões surgirem)

## Stack / Domínio

<!-- Decisões sobre tecnologia/arquitetura. Carrega, mas só para CONFIRMAR rápido — nunca substitui grill. -->

- Monorepo **pnpm** com `packages/backend` (NestJS) e `packages/frontend` (Next.js + Tailwind), a partir do template `luan-templates/pnpm`.
- Scripts de sync dos templates são **one-shot local** — copiam de `luan-templates` para `packages/*` e **nunca entram no repositório**.
- **Prisma** como ORM; **PostgreSQL + pgvector**, **Redis** (BullMQ) e **MinIO** na infra local.
- IA via **`@luanpoppe/ai`** com OpenRouter como provedor default.
- Sem autenticação na fundação — modo usuário único/dev até mudança futura.
