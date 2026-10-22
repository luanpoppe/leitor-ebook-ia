# Frontend de ebooks

> Atualizado em 2026-10-21 · fontes: `packages/frontend/src/features/shelf/**`, `packages/frontend/src/features/ebooks/**`, `packages/frontend/src/app/**`

## O que é

A home é a estante: o leitor envia o ebook, acompanha o preparo e abre a ficha de cada livro. O visual segue a direção **Vitrine editorial** (composição da Vitrine + prateleira de capas grandes do Editorial) com o amarelo **Manteiga** como cor de destaque.

## Como funciona

- `ShelfPage` (`features/shelf/components/shelf-page.tsx`) compõe a home: `AppShell` (sidebar + canvas), `ShelfHeader`, `LeadCard` (livro mais recente pronto), `StatsStrip`, `BookGrid` e `ShelfRail` (envio, fila de preparo e últimos envios). A home (`src/app/page.tsx`) só renderiza `<ShelfPage />`.
- `AppShell` centraliza a marca **Folio** (`product.ts`), a navegação e o rodapé; a mesma casca é usada pela ficha em `/ebooks/[id]`. No celular a sidebar vira uma barra no topo.
- `useShelf` (`hooks/use-shelf.ts`) junta `useEbooks` + `useReprocessEbook`, calcula `ShelfStats` e cuida do livro selecionado e do destaque de duplicata.
- `useEbookFileDrop` (`hooks/use-ebook-file-drop.ts`) é o comportamento da área de envio: validação local, drag-and-drop, progresso, erros e duplicata. `UploadFileValidator` é compartilhado com a API.
- `BookCover` (`components/book-cover.tsx`) mostra a capa pré-assinada e, quando não há capa, uma capa tipográfica (título + formato) em vez de um ícone ou espaço vazio.
- `BookDetailDialog` (modal na estante) e `BookDetailPage` (`/ebooks/[id]`) compartilham `useEbookDetail`, `DetailFacts` e `StatusMark`; ambos usam o mesmo cache React Query.
- `format.ts` formata data/hora, bytes e extensão; `constants.ts` concentra 50 MB, extensões e o tamanho de página.

## Decisões e porquês

- **Tokens no `globals.css`** — cor, tipografia e espaçamento vivem em custom properties (`--accent`, `--accent-soft`, `--on-accent`, …). Trocar o amarelo é trocar cinco valores; a interface não espalha hex.
- **Somente tema claro** — o `prefers-color-scheme` antigo pintava o fundo de escuro e deixava o texto escuro (contraste 1.1:1). O produto agora fixa `color-scheme: light` e seus próprios tokens.
- **Texto sobre o amarelo é escuro** — branco sobre Manteiga não passa em contraste; `--on-accent` resolve botão, chips e ação primária.
- **Destaque = livro mais recente pronto** — se nenhum estiver pronto, cai para o primeiro da lista. O título é encurtado no destaque (`ShortTitle`) e completo na ficha.
- **Grade de capas 4/3/2** — a largura máxima da estante com o trilho de 340px comporta quatro capas em 1440, três em tablets e duas no celular.
- **Trilho de 340px** — o padrão estudado era 384px; reduzimos para as capas ganharem ~207px de largura sem perder o painel de envio.
- **Duplicata destacada** — o 409 traz o id existente; a estante rola até o cartão e o destaca por 4s. Fora das páginas carregadas, abre a ficha.
- **Ficha conta a preparação** — a página do livro explica em uma frase o estado real (`pending`/`processing`/`ready`/`failed`) e mantém o motivo do erro e o “Tentar de novo” no mesmo painel.
- **Modal sempre com fechar visível** — o botão de fechar fica fixo no canto do diálogo em qualquer estado (carregando, erro, sucesso), garantindo o foco inicial do `useDialogPanel`.
- **Capa sem imagem vira capa tipográfica** — título e formato no lugar da arte, na cor de destaque; não há placeholder cinza nem ícone.

## Notas

- Rode `pnpm --filter @leitor-ebook-ia/frontend run lint` e `run build`; tipos com `exec tsc --noEmit`.
- Rotas: `/` (estante) e `/ebooks/[id]` (ficha do livro).
- Nome e assinatura do produto ficam em `features/shelf/product.ts`; o título do documento em `app/layout.tsx`.
- Pendências antigas ainda válidas: paginação por offset pode duplicar item entre abas; o polling refaz todas as páginas carregadas. O `<h3>` dentro de `<button>` foi resolvido (títulos viraram `span`).
