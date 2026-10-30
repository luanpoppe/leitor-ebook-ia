-- Nota: o Prisma também propôs DROP INDEX "chunks_embedding_hnsw_idx", mas
-- esse índice HNSW é criado à mão (não é expressável no schema Prisma); foi
-- removido daqui de propósito para não derrubar a busca vetorial.

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "content" TEXT NOT NULL,
    "chapter_position" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notes_book_updated_idx" ON "notes"("book_id", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
