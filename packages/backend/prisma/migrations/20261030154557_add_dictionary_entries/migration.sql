-- Nota: o Prisma também propôs DROP INDEX "chunks_embedding_hnsw_idx", mas
-- esse índice HNSW é criado à mão (não é expressável no schema Prisma); foi
-- removido daqui de propósito para não derrubar a busca vetorial.

-- CreateTable
CREATE TABLE "dictionary_entries" (
    "id" UUID NOT NULL,
    "word" VARCHAR(120) NOT NULL,
    "normalized_word" VARCHAR(120) NOT NULL,
    "meaning" TEXT NOT NULL,
    "example" TEXT,
    "quote" TEXT,
    "book_id" UUID,
    "chapter_position" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dictionary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entries_normalized_word_key" ON "dictionary_entries"("normalized_word");

-- CreateIndex
CREATE INDEX "dictionary_entries_updated_idx" ON "dictionary_entries"("updated_at" DESC);

-- AddForeignKey
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
