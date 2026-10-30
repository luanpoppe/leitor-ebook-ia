---
# Progresso de leitura

> Atualizado em 2026-10-22 · fontes: `packages/backend/src/api/ebooks/reading-progress.service.ts`, `src/api/ebooks/ebook-progress.controller.ts`, `src/catalog/reading-progress.repository.ts`, `prisma/migrations/20261022130000_create_reading_progress/**`

## O que é

Guarda onde o leitor parou em cada ebook — capítulo e offset em caracteres — e devolve esse ponto para a tela de leitura retomar. Uma linha por livro, sobrescrita a cada avanço.

## Como funciona

- `EbookProgressController` expõe `GET /ebooks/:bookId/progress` e `PUT /ebooks/:bookId/progress`; o PUT recebe `SaveReadingProgressDto` (`chapterPosition` ≥ 1, `offset` ≥ 0).
- `ReadingProgressService.get` confere que o livro existe e devolve `null` quando não há linha; o controller traduz `null` em **204 sem corpo**.
- `ReadingProgressService.save` valida capítulo inexistente (404 `ChapterNotFoundError`) e offset acima do `char_length` do capítulo (422 `InvalidReadingProgressError`) antes de chamar o repositório.
- `ReadingProgressRepository` faz `findUnique`/`upsert` por `bookId` e é o único lugar que traduz `offset` ↔ `char_offset`.
- Erros saem pelo `EbooksExceptionFilter`: 400 (Zod), 404 (livro/capítulo), 422 (offset).
- O `ReadingProgressRepository` é provido no `EbooksModule`, não no `CatalogModule`.

## Decisões e porquês

- **Coluna `char_offset`, campo de contrato `offset`** — `OFFSET` é palavra-chave SQL; a tradução fica na borda do banco (escrita) e em `toResponse` (leitura).
- **PK é `bookId`, sem FK para `chapters`** — um reprocessamento apaga e recria os capítulos; com FK o progresso sumiria junto. O preço é que um capítulo encurtado pode deixar o progresso apontando para além do fim (a tela volta ao início).
- **GET sem progresso responde 204** — "nunca lido" não é erro nem objeto vazio; o cliente decide abrir do começo.
- **Não exigir status `ready`** — o progresso é só um marcador; a leitura em si continua bloqueada pela API de capítulos (409).
- **`offset === chapterLength` é válido** — é exatamente o fim do capítulo; só ultrapassar gera 422.
- **Uma linha por livro, vence o último PUT** — não há histórico, percentual nem `userId` nesta versão.
- **204 escrito à mão com `@Res()`** — com `passthrough` o Nest reaplica o 200 padrão ao enviar o corpo e sobrescreve o status condicional.

## Notas

- O cliente lê o progresso sempre, inclusive quando a URL traz `?capitulo=N`: o capítulo da URL vence a escolha do capítulo, mas o offset salvo é usado quando é o mesmo capítulo; um capítulo diferente abre no começo.
- A gravação normal é debounce de ~2 s, com flush em troca de capítulo, `visibilitychange` e desmontagem. No `pagehide`, o cliente usa `navigator.sendBeacon` (que só envia POST) e o backend tem um POST equivalente ao PUT.
- O ponto de retomada é congelado na abertura: saves seguintes atualizam o progresso salvo e o cache do React Query, mas não reposicionam a página que já está aberta.

- O debounce (~2 s) e o descarregamento ao trocar de capítulo/aba são responsabilidade do cliente (feature de tela de leitura), não do contrato.
- Validado contra o Dom Casmurro (`01a15f7c-…`): capítulo 3 tem 53.872 caracteres; 99999999 → 422, posição 9 → 404, livro inexistente → 404.
- Achado de code review fora do escopo: `GET /chapters/:position?offset=2147483647` estoura int4 no `substr("text", offset + 1, …)` — teto deveria ser `2_147_483_646`.
---
