# Frontend de ebooks

> Atualizado em 2026-10-21 · fontes: `packages/frontend/src/features/ebooks/**`, `packages/frontend/src/app/**`

## O que é

A tela inicial do produto: a home virou a estante, onde o leitor arrasta o ebook, vê o progresso do envio e acompanha sozinho o processamento de cada livro. Cada livro abre em painel (e em página própria por link), e quem falhou pode ser reprocessado sem reenviar o arquivo.

## Como funciona

- `Estante` (`components/estante.tsx`) compõe a tela: `UploadDropzone`, estados de carregamento/vazio/erro, grade de `EbookCard`, botão "Carregar mais" e `EbookDetailPanel` quando há livro selecionado. A home (`src/app/page.tsx`) é só um componente de servidor que renderiza `<Estante />`.
- `useEbooks` (`use-ebooks.ts`) usa `useInfiniteQuery` com `pageSize` 20, achata as páginas e refaz a lista a cada 3s **somente** enquanto algum item carregado está `pending`/`processing`.
- `useEbookDetail` (`use-ebook-detail.ts`) busca por id, mantém o polling no mesmo critério e expõe `notFound` (404) separado de falha de rede.
- `useUploadEbook` envia com `onUploadProgress`, expõe percentual, `errorInfo` normalizado e callbacks `onSuccess`/`onDuplicate`; invalida a estante ao concluir.
- `useReprocessEbook` mantém um conjunto de ids em voo (`isReprocessingFor`), ignora clique repetido no mesmo livro e invalida estante e detalhe tanto no sucesso quanto no erro.
- A camada de API (`api.ts`) envolve as quatro rotas na instância axios de `@/utils/http`; `getApiErrorInfo` traduz `{ statusCode, message, id }` e erros de rede, e é a fonte das mensagens de erro na tela.
- `format.ts` formata data/hora, bytes (B/KB/MB/GB) e extensão em pt-BR; `constants.ts` concentra 50 MB, extensões aceitas, `accept` e o tamanho de página.

## Decisões e porquês

- **Validação local antes do upload** — extensão e tamanho são barrados no navegador para o aviso ser imediato; a API continua sendo a autoridade.
- **Polling condicionado** — 3s enquanto há livro em ingestão, `false` nos estados finais; sem isso a tela consultaria para sempre, e com isso cumpre o "atualiza sozinho".
- **Duplicata destacada** — o 409 traz o id do livro existente; a estante rola até o cartão e o destaca por 4s. Se o cartão não estiver nas páginas carregadas, abre o painel daquele livro.
- **Mensagem de erro do cartão vem do detalhe** — a listagem original não trazia `errorMessage`; o cartão busca `GET /ebooks/:id` só quando o status é `failed`.
- **Capa na listagem** — o resumo da API passou a incluir `coverUrl` (presign por item, falha isolada vira `null`), então a grade mostra capa real.
- **Painel e página usam os mesmos hooks** — o detalhe em modal e em `/ebooks/[id]` compartilha cache; o painel é modal com foco preso, Esc, clique fora e restauração de foco.
- **Um componente por arquivo em `src/features/ebooks/components/`** — o `content` do Tailwind ganhou `./src/features/**` para as classes existirem em produção.

## Notas

- `npm`/`pnpm` scripts: `pnpm --filter @leitor-ebook-ia/frontend run lint` e `run build`.
- Rotas: `/` (estante, estática) e `/ebooks/[id]` (detalhe, dinâmica).
- Pendências adiadas do code review: paginação por offset pode duplicar item entre abas; polling refaz todas as páginas carregadas; `<h3>` dentro de `<button>` no cartão (a11y); detalhe duplicado entre painel e página.
