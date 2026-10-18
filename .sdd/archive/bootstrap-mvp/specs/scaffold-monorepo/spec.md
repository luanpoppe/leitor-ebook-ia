# Spec: Scaffold do monorepo

> Parte de [`bootstrap-mvp`](../../plan.md)

## Resumo

Bootstrap do monorepo pnpm do projeto `leitor-ebook-ia`, com `packages/backend` (NestJS) e `packages/frontend` (Next.js + Tailwind) populados via sync one-shot local dos templates `luan-templates` — scripts de sync **não são versionados** no repositório.

## Requirements

### REQ-1: Desenvolvedor sobe o monorepo

- **Dado que** o repositório foi clonado e as dependências instaladas com `pnpm install` na raiz
- **Quando** o desenvolvedor executa `pnpm dev` na raiz
- **Então** o backend NestJS inicia em modo watch
- **E** o frontend Next.js inicia em modo dev
- **E** ambos rodam em paralelo sem erro de workspace

### REQ-2: Estrutura raiz do monorepo

- **Entrada** template raiz em `luan-templates/pnpm` (`package.json`, `pnpm-workspace.yaml`)
- **Saída** raiz do projeto com os mesmos arquivos adaptados ao nome `leitor-ebook-ia`
- **E** `pnpm-workspace.yaml` declara `packages/*`
- **E** script `dev` sobe backend e frontend em paralelo via filtros `@leitor-ebook-ia/backend` e `@leitor-ebook-ia/frontend`

### REQ-3: Pacotes sincronizados dos templates

- **Entrada** sync one-shot local a partir de `luan-templates/nestjs` e `luan-templates/frontend/nextjs-ts-tailwind`
- **Saída** `packages/backend` populado com scaffold NestJS
- **E** `packages/frontend` populado com scaffold Next.js + Tailwind
- **E** campo `name` de cada `package.json` ajustado para `@leitor-ebook-ia/backend` e `@leitor-ebook-ia/frontend`

### REQ-4: Sync one-shot sem scripts versionados

- **Entrada** scripts de sync do template `luan-templates/pnpm` executados localmente com caminhos absolutos fixos para `C:\_pastas-disco-c\repositorios-c\pessoal\luan-templates\...`
- **Saída** templates copiados para `packages/backend` e `packages/frontend`
- **E** pasta `scripts/` removida após a execução — não entra em nenhum commit do repositório

## Edge cases

- `node_modules` e `dist` dos templates fonte não são copiados (skip dirs dos scripts de sync)
- Backend NestJS escuta na porta `3026`  ||  frontend Next.js na porta `3027` (conforme `Portas Usadas no PC.txt`)
- Backend expõe `GET /health` com `{ status: "ok" }`  ||  stub `POST /users` do template removido
- Páginas de auth do template frontend (`signup`, `profile`) permanecem no scaffold  ||  remoção fica para `frontend-core`
