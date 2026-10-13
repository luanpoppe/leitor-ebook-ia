# Spec: Frontend base

> Parte de [`bootstrap-mvp`](../../plan.md)

## Resumo

Shell do frontend Next.js: layout raiz (Tailwind + toaster) com o provider do TanStack Query, um cliente HTTP (axios) apontado para a API e a home como placeholder. Sem domínio e sem autenticação; as páginas de auth do template são removidas.

## Requirements

### REQ-1: Desenvolvedor sobe o frontend

- **Dado que** as dependências estão instaladas e o `.env` da raiz configura `NEXT_PUBLIC_API_URL`
- **Quando** o desenvolvedor roda `pnpm dev` na raiz
- **Então** o Next sobe na porta `3027`
- **E** a home renderiza o shell
- **E** o build (`next build`) passa sem erro

### REQ-2: Cliente HTTP configurado pela URL da API

- **Entrada** `NEXT_PUBLIC_API_URL=http://localhost:3026`
- **Saída** instância axios com `baseURL` = essa URL, exportada para os módulos consumirem
- **Erro** `NEXT_PUBLIC_API_URL` ausente → o cliente sobe sem `baseURL`  ||  nenhuma requisição é feita nesta feature

### REQ-3: Provider do TanStack Query no layout

- **Entrada** layout raiz (`app/layout.tsx`)
- **Saída** `QueryClientProvider` envolvendo o app, com defaults `staleTime` 30s e `retry` 1
- **E** `ReactQueryDevtools` montado apenas em desenvolvimento

### REQ-4: `.env` da raiz alimenta o Next

- **Entrada** `.env` na raiz do monorepo com `NEXT_PUBLIC_API_URL`
- **Saída** `next.config.ts` carrega `../../.env` e a variável fica disponível ao dev/build
- **E** o `.env.example` da raiz documenta a variável

### REQ-5: Shell sem as páginas de auth do template

- **Entrada** páginas `signup`, `profile`, `profile/[id]` do template + `utils/enums/auth.enum.ts` e `utils/custom-hooks/loading.hook.ts`
- **Saída** esses arquivos removidos
- **E** a home vira um placeholder simples (título/estrutura, sem chamar a API)

## Edge cases

- `NEXT_PUBLIC_API_URL` ausente no build → o cliente fica sem `baseURL`; como a home não faz requisição, nada quebra em runtime  ||  vira erro só quando existir um consumidor.
- Porta `3027` já em uso → `pnpm dev` falha com erro explícito de bind.
- Devtools do Query não entram no bundle de produção (montados só quando não for produção).

## Contratos expostos

- Variável de ambiente **`NEXT_PUBLIC_API_URL`** (nova, provisória): URL base da API consumida pelo frontend; documentada no `.env.example` da raiz.
