---
# Títulos de capítulo

> Atualizado em 2026-10-22 · fontes: `packages/backend/src/extraction/**`, `src/catalog/chapter-title.repository.ts`, `src/cli/backfill-titles*`

## O que é

O nome de cada capítulo, extraído do próprio arquivo e persistido em `chapters.title`. É a base do sumário do leitor: sem ele, a tela só teria "Capítulo N".

## Como funciona

- `ExtractedChapter.title` (opcional) atravessa extração → chunking → `replaceContent`, que grava em `chapters.title` (`VARCHAR(200)`; nulo = sem título confiável).
- `ChapterTitle.normalize` colapsa espaços, conta code points e descarta acima de 200; `TextNormalizer.normalizeChapters` aplica e mantém título/texto pareados na filtragem e na renumeração.
- Fontes por formato: EPUB = rótulo do nav/NCX com fallback para o primeiro `h1`–`h3`; PDF = título do outline com fallback para a primeira linha reconhecida; TXT/MD = o próprio marcador.
- `backfill:titles` (`src/cli/backfill-titles.ts`) percorre livros `ready`, baixa o original do MinIO, reextrai e atualiza **só** `chapters.title` por position, sem tocar em chunks ou embeddings. É idempotente (guarda `title IS NULL`) e pula livro já titulado ou com contagem de capítulos divergente.

## Decisões e porquês

- **Texto canônico, sem converter para EPUB** — o leitor lê `chapters.text`; o título vem da mesma extração que alimenta os chunks.
- **Nulo em vez de fallback** — "Capítulo N" é apresentação; o banco distingue "não tem título" de "título literal".
- **Descarte acima de 200, não truncar** — título longo costuma ser prosa mal detectada.
- **Última ocorrência vence no sumário** — em hierarquia parte→capítulo, o item mais específico vem depois.
- **Backfill sem reingestão** — reprocessar apagaria os embeddings já pagos; o script atualiza só a coluna.

## Notas

- A duplicata visual (o texto do EPUB/PDF começa com o título) será escondida na tela de leitura, sem alterar o texto indexado.
- O `ChapterTitleRepository` é provido no módulo do CLI; se for reutilizado pela API, mover para `CatalogModule`.
- Reexecutar `backfill:titles` é seguro: `scanned=8, updated=0, skipped=8` na segunda passada.
