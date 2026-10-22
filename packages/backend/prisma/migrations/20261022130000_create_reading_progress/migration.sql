-- CreateTable
-- Nota: a migração gerada pelo Prisma também propunha DROP INDEX "chunks_embedding_hnsw_idx".
-- Esse índice HNSW é criado à mão (não é expressável no schema Prisma); foi removido
-- daqui de propósito, como nas migrations anteriores.
CREATE TABLE "reading_progress" (
    "book_id" UUID NOT NULL,
    "chapter_position" INTEGER NOT NULL,
    "char_offset" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("book_id"),
    CONSTRAINT "reading_progress_chapter_position_positive_check" CHECK ("chapter_position" >= 1),
    CONSTRAINT "reading_progress_char_offset_non_negative_check" CHECK ("char_offset" >= 0)
);

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
