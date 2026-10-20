-- AlterTable
-- Nota: a migração gerada também propunha DROP INDEX "chunks_embedding_hnsw_idx".
-- Esse índice HNSW é criado à mão (não é expressável no schema Prisma) e foi
-- removido daqui de propósito para a capa/author não derrubarem a busca vetorial.
ALTER TABLE "books" ADD COLUMN     "author" TEXT,
ADD COLUMN     "cover_storage_key" TEXT;
