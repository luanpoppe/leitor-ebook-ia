# Scaffold do monorepo

## O que é

Monorepo pnpm com `packages/backend` (NestJS) e `packages/frontend` (Next.js + Tailwind), orquestrado por `pnpm dev` na raiz.

## Como funciona

- Raiz: `package.json` com script `dev` que sobe `@leitor-ebook-ia/backend` e `@leitor-ebook-ia/frontend` em paralelo.
- Backend na porta **3026** (`EnvService.PORT`, default 3026). Swagger em `/api`, health em `/health`.
- Frontend na porta **3027** (`next dev --turbopack -p 3027`).
- Pacotes populados via sync one-shot local dos templates `luan-templates` — scripts de sync **não são versionados**.

## Decisões

- Sync one-shot: scripts executados localmente e removidos; não entram no repositório.
- `tsconfig.json` na raiz não existe (só era necessário para validar scripts).
- Stub `POST /users` e env vars Gemini/OpenAI do template removidos; `GET /health` adicionado.
- Páginas auth do frontend (`signup`, `profile`) mantidas como placeholder — remoção em `frontend-core`.
