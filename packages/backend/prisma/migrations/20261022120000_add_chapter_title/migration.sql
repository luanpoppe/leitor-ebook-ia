-- AlterTable
-- Nota: a migração gerada pelo Prisma também propunha DROP INDEX "chunks_embedding_hnsw_idx".
-- Esse índice HNSW é criado à mão (não é expressável no schema Prisma); foi removido
-- daqui de propósito, como nas migrations anteriores.
ALTER TABLE "chapters" ADD COLUMN     "title" VARCHAR(200);

-- AddCheckConstraint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_title_not_blank_check" CHECK ("title" IS NULL OR btrim("title") <> '');
