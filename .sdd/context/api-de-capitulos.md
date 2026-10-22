---
# API de capítulos

> Atualizado em 2026-10-22 · fontes: `packages/backend/src/api/ebooks/**`, `src/catalog/chapter-reading.repository.ts`

## O que é

Duas rotas de leitura para o leitor: o sumário de um livro pronto (posição, título e contagem de palavras) e uma página de texto de um capítulo, recortada por offset.

## Como funciona

- `EbookChaptersController` expõe `GET /ebooks/:bookId/chapters` e `GET /ebooks/:bookId/chapters/:position?offset&limit`, com os DTOs Zod `ChapterPositionParamsDto` e `ChapterPageQueryDto`.
- `EbookReadingService` valida existência e status `READY` (`assertBookReady`), monta `{ items }` e a página com `nextOffset` e vizinhos.
- `ChapterReadingRepository` faz as consultas em SQL: `wordCount` no banco, `substr`/`char_length` para o recorte e duas subconsultas para os vizinhos.
- Erros: `ChapterNotFoundError` → 404, `EbookNotReadyError` → 409, validação → 400; traduzidos pelo `EbooksExceptionFilter`.
- Paginação em caracteres (code points), default 50.000 e teto 100.000; `nextOffset` é `offset + limit` comparado a `totalLength`.

## Decisões e porquês

- **Só livro pronto** — conteúdo parcial não serve para leitura; qualquer outro status vira 409.
- **Por position** — é a ordem estável usada pelo sumário e, futuramente, pelo progresso.
- **`wordCount` no banco** — evita trafegar o texto só para contar.
- **Repositório de leitura separado** — o repositório de escrita já tem transação e ~380 linhas.
- **Vizinhos no payload** — o leitor navega sem carregar o sumário inteiro.

## Notas

- O `ChapterReadingRepository` é provido no `EbooksModule`; se outro módulo precisar, mover para o `CatalogModule`.
- A contagem de palavras e a paginação foram validadas contra um capítulo real (Dom Casmurro: 56.575 caracteres, 6 páginas de 10.000).
---
