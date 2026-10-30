-- CreateEnum
CREATE TYPE "highlight_color" AS ENUM ('yellow', 'green', 'blue', 'pink');

-- CreateTable
CREATE TABLE "highlights" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_position" INTEGER NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "end_offset" INTEGER NOT NULL,
    "quote" TEXT NOT NULL,
    "color" "highlight_color" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "highlights_book_position_idx" ON "highlights"("book_id", "chapter_position", "start_offset");

-- CreateIndex
CREATE INDEX "highlights_book_color_idx" ON "highlights"("book_id", "color");

-- AddForeignKey
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nota: o Prisma tambem proporia DROP INDEX "chunks_embedding_hnsw_idx", mas
-- esse indice HNSW e criado a mao (nao e expressavel no schema Prisma); fica
-- preservado de proposito para nao derrubar a busca vetorial.
