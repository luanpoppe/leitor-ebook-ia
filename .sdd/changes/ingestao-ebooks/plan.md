# Ingestão de ebooks

> **id**: `ingestao-ebooks` · **criada**: 2026-10-18 · **idioma**: pt-BR

## Contexto

Segunda mudança do leitor de ebooks com IA. A fundação (monorepo, infra local, backend base e shell do frontend) já existe; agora o produto precisa transformar um arquivo de ebook em conteúdo consultável: texto estruturado por capítulos e trechos com embeddings no pgvector, prontos para o chat RAG e o modo sem spoilers. Cobre EPUB, PDF e TXT/Markdown; processamento assíncrono por fila; arquivo original no MinIO.

## Decisões macro

- **Formatos: EPUB, PDF e TXT/Markdown** — cobrir o que o usuário vai subir desde já; um parser por formato. **Alternativa descartada**: só EPUB nesta mudança.
- **Ingestão RAG-ready** — extração + chunking + embeddings no pgvector, para desbloquear chat RAG e modo sem spoilers depois.
- **Processamento por fila (BullMQ)** — o upload responde rápido e o worker processa em background, retomável em falha. Reaproveita o `QueueModule` já wiring no backend-core.
- **Arquivo original no MinIO** (bucket `ebooks`) — reutiliza o `StorageModule` e fica fiel à produção.
- **Reúso do backend-core** — Prisma 7 (extensão `vector`), `QueueModule` (BullMQ/ioredis), `StorageModule` (MinIO) e `AiModule` (`@luanpoppe/ai`); nada disso é recriado.
- **Destravar o MinIO local primeiro** — a imagem `minio/minio` não pulla; corrigir antes de qualquer escrita no bucket.

## Features (executadas sequencialmente)

1. **minio-local** — Destravar o MinIO local (imagem que não pulla) e validar o bucket `ebooks`.
2. **catalogo-ebooks** — Domínio e persistência: `books`, `chapters` e `chunks` (embedding `vector`), repositórios e ciclo de status da ingestão.
3. **armazenamento-arquivos** — Operações de objeto no MinIO (subir, baixar, remover) no bucket `ebooks`.
4. **extracao-conteudo** — Parsers EPUB, PDF e TXT/Markdown → capítulos e texto normalizado.
5. **chunking-embeddings** — Chunking do texto e geração de embeddings via `@luanpoppe/ai`, gravando no pgvector.
6. **pipeline-ingestao** — Fila BullMQ + worker que orquestra MinIO → extração → chunk/embed → status, com retry e idempotência.
7. **api-ebooks** — Endpoints de upload (valida, guarda, cria o `Book`, enfileira), de status e de listagem.
8. **frontend-ebooks** — Tela de upload e acompanhamento do status da ingestão (axios + TanStack Query).

## Escopo

**Dentro**: ingestão de EPUB/PDF/TXT-MD, armazenamento em MinIO, chunking + embeddings no pgvector, fila de processamento, API e tela de upload/status, destrave do MinIO local.

**Fora**: leitura do ebook (epub.js), chat RAG, modo sem spoilers, autenticação, destaques/notas, renderização de PDF, PWA, mobile/desktop.
