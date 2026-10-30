-- Nota: o Prisma também propôs DROP INDEX "chunks_embedding_hnsw_idx", mas
-- esse índice HNSW é criado à mão (não é expressável no schema Prisma); foi
-- removido daqui de propósito para não derrubar a busca vetorial.

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "note_actions" JSONB;
