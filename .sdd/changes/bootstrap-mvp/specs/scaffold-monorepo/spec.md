# Spec: Scaffold do monorepo

> Parte de [`bootstrap-mvp`](../../plan.md)

## Resumo

Bootstrap do monorepo pnpm do projeto `leitor-ebook-ia`, copiando a estrutura raiz do template pnpm e populando `packages/backend` (NestJS) e `packages/frontend` (Next.js + Tailwind) via scripts de sync existentes.

## Requirements

### REQ-1: Desenvolvedor sobe o monorepo

- **Dado que** o repositório foi clonado e as dependências instaladas com `pnpm install` na raiz
- **Quando** o desenvolvedor executa `pnpm dev` na raiz
- **Então** o backend NestJS inicia em modo watch
- **E** o frontend Next.js inicia em modo dev
- **E** ambos rodam em paralelo sem erro de workspace

### REQ-2: Estrutura raiz do monorepo

- **Entrada** template raiz em `luan-templates/pnpm` (`package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, pasta `scripts/`)
- **Saída** raiz do projeto com os mesmos arquivos adaptados ao nome `leitor-ebook-ia`
- **E** `pnpm-workspace.yaml` declara `packages/*`

### REQ-3: Pacotes sincronizados dos templates

- **Entrada** execução dos scripts `sync-backend-from-nestjs.ts` e `sync-frontend-from-nextjs-ts-tailwind.ts` via `tsx`
- **Saída** `packages/backend` populado a partir de `luan-templates/nestjs`
- **E** `packages/frontend` populado a partir de `luan-templates/frontend/nextjs-ts-tailwind`
- **E** campo `name` de cada `package.json` ajustado para `@leitor-ebook-ia/backend` e `@leitor-ebook-ia/frontend`

### REQ-4: Scripts de sync com caminhos fixos

- **Entrada** scripts `sync-backend-from-nestjs.ts` e `sync-frontend-from-nextjs-ts-tailwind.ts` com caminhos absolutos para `C:\_pastas-disco-c\repositorios-c\pessoal\luan-templates\...`
- **Saída** templates copiados para `packages/backend` e `packages/frontend` via `tsx`
- **Erro** diretório fonte inexistente → script encerra com código 1 e mensagem indicando o caminho esperado

## Edge cases

- `node_modules` e `dist` dos templates fonte não são copiados (skip dirs dos scripts de sync)
- Backend NestJS escuta na porta `3026`  ||  frontend Next.js na porta `3027` (conforme `Portas Usadas no PC.txt`)
- Páginas de auth do template frontend (`signup`, `profile`) permanecem no scaffold  ||  remoção fica para `frontend-core`
