# Contexto do projeto — leitor-ebook-ia

> Como as funcionalidades do projeto funcionam (macro + decisões). Mantido pelos fluxos lp:* e por lp:context. LIDO no início de todo fluxo.

## Áreas / funcionalidades

- [scaffold-monorepo](./scaffold-monorepo.md) — monorepo pnpm, backend NestJS, frontend Next.js
- [infra-local](./infra-local.md) — Docker Compose (Postgres pgvector, Redis, MinIO), `.env` e scripts `pnpm docker:up`/`down`
- [backend-core](./backend-core.md) — módulos NestJS base: config tipada, Prisma 7, BullMQ/Redis, IA, MinIO e health/readiness.
- [frontend-core](./frontend-core.md) — shell Next.js: layout + TanStack Query, cliente axios com env validada (zod), home placeholder
- [minio-local](./minio-local.md) — object storage de dev: imagem bitnamilegacy/minio, entrypoint que cria o bucket `ebooks`
- [catalogo-ebooks](./catalogo-ebooks.md) — tabelas books/chapters/chunks (embedding pgvector), EbookRepository com dedupe por hash e reprocessamento transacional
- [armazenamento-arquivos](./armazenamento-arquivos.md) — FileStorageService sobre o MinIO: chave `<hash>.<ext>`, streams, URL pré-assinada e remoção idempotente
- [extracao-conteudo](./extracao-conteudo.md) — ContentExtractor por formato (EPUB/PDF/TXT/MD), parsers de capítulo, normalização de texto e capa em `covers/<hash>.<ext>`
- [chunking-embeddings](./chunking-embeddings.md) — TextChunker, EmbeddingService e ContentIndexingService: trechos de ~1.000 chars, vetores de 1536 no pgvector e retomada só dos faltantes
- [pipeline-ingestao](./pipeline-ingestao.md) — fila BullMQ + worker in-process: enfileira por bookId, extrai ou retoma, grava parciais e fecha ready/failed
- [api-ebooks](./api-ebooks.md) — borda HTTP da estante: upload multipart com compensação, listagem/detalhe com capa pré-assinada, reprocess e filtro de erro `{ statusCode, message }`
- [frontend-ebooks](./frontend-ebooks.md) — estante na home: upload com progresso, lista com polling condicionado, cartão, painel de detalhe e página `/ebooks/[id]`
- [titulos-de-capitulo](./titulos-de-capitulo.md) — nome de cada capítulo extraído do arquivo, persistido em `chapters.title` e backfill dos livros antigos
- [api-de-capitulos](./api-de-capitulos.md) — rotas de sumário e de página de capítulo, com paginação por offset e vizinhos
- [progresso-de-leitura](./progresso-de-leitura.md) — ponto de retomada por livro (capítulo + offset em caracteres), rotas GET/PUT e as decisões de 204 e PK por livro
- [tela-de-leitura](./tela-de-leitura.md) — rota `/ebooks/[id]/ler`: sumário em drawer, tipografia, teclado, retomada, gravação com debounce/beacon e estados de erro/fim
- [motor-de-janelas](./motor-de-janelas.md) — trechos de até 20 mil caracteres, páginas medidas, pré-busca, âncora de repaginação e camada de medição
- [modo-pagina](./modo-pagina.md) — leitura página a página: composição da tela, medição, gestos, teclado, indicador e aviso de falha
- [modo-rolagem](./modo-rolagem.md) - leitura contínua: janelas de 4 mil caracteres, virtualização por espaçador, travessia de capítulo e preferência de modo
- [anotacoes](./anotacoes.md) — anotações em markdown por livro: tabela `notes`, CRUD, ferramentas do chat (criar/listar/ler/editar/excluir com confirmação) e painel no leitor
- [dicionario](./dicionario.md) — dicionário pessoal de palavras: uma entrada por palavra, ferramenta do chat, página com filtro por livro e contexto do livro
- [marcacoes](./marcacoes.md) — marcações de texto em quatro tons claros: offsets em code points, renderização nos dois modos, painel no leitor com salto/retorno, página global e ferramenta do chat
