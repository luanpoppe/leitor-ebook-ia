-- Nota: a migração gerada pelo Prisma também propunha
-- DROP INDEX "chunks_embedding_hnsw_idx". Esse índice HNSW é criado à mão
-- (não é expressável no schema Prisma) e foi removido daqui de propósito para
-- não derrubar a busca vetorial.

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN     "summary" TEXT;
