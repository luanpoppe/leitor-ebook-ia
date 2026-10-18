# Frontend base (shell Next.js)

## O que é

Shell do frontend Next.js (App Router + Tailwind): layout raiz com o provider do TanStack Query, cliente HTTP axios apontado para a API e home placeholder. Sem domínio e sem autenticação nesta mudança.

## Como funciona

- O layout raiz (`src/app/layout.tsx`) monta `<Toaster/>` e `<Providers>`, e importa `@/env` por efeito colateral — garante que a validação da env rode no load do servidor, falhando o build cedo se a var faltar/for inválida.
- `src/env.ts` valida `NEXT_PUBLIC_API_URL` com zod e exporta `env`. Usa `parse` (lança = fail-fast). O objeto é montado com acesso estático a `process.env.NEXT_PUBLIC_API_URL`, porque o Next só inlineia esse acesso no bundle do browser.
- `src/utils/http.ts` cria a instância axios `api` com `baseURL = env.NEXT_PUBLIC_API_URL`. Ainda não é consumida por tela nenhuma (não há domínio).
- `src/app/providers.tsx` (`"use client"`) cria o `QueryClient` uma vez (`staleTime` 30s, `retry` 1) e monta o `ReactQueryDevtools` só quando `NODE_ENV=development`, via `next/dynamic` — em produção o import é eliminado do bundle.
- `next.config.ts` carrega o `.env` da raiz (`../../.env`) via `dotenv`, porque o Next roda com cwd `packages/frontend`.
- A home (`src/app/page.tsx`) é um placeholder estático, sem fetch.
- As páginas de auth do template (`signup`, `profile`, `profile/[id]`) e os módulos órfãos `utils/enums/auth.enum.ts` e `utils/custom-hooks/loading.hook.ts` foram removidos.

## Decisões

- Env validada com `parse` (lança) em vez de `safeParse`: fail-fast explícito (REQ-2/CT-06 da spec).
- `providers.tsx` mantém `process.env.NODE_ENV` direto (não via `env.ts`) para o dead-code elimination remover o import dos devtools em produção.
- `layout.tsx` importa `@/env` por efeito colateral: o `env.ts` só era referenciado por `http.ts`, que nenhuma rota importa, então a validação era dead code e o fail-fast não acontecia (achado A1 do code review, corrigido).
- `NEXT_PUBLIC_API_URL` é contrato novo e provisório, documentado no `.env.example` da raiz.

## Notas

- Portas: backend 3026, frontend 3027.
- Sem testes automatizados nesta mudança (`tests: off`).
- Achados menores em aberto do code review (não bloqueiam): `next.config.ts` carrega o `.env` inteiro da raiz, expondo segredos do backend ao runtime do Next (A2); o caminho do `.env` usa `process.cwd()` e quebra se o build rodar de outro cwd, sem tratar o `error` do dotenv (A3); o dotenv 18 escreve um aviso em stderr que o PowerShell reporta como falha de build (A4).
