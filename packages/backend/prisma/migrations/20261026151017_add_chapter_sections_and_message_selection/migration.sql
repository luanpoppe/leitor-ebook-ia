-- Nota: a migração gerada pelo Prisma também propunha
-- DROP INDEX "chunks_embedding_hnsw_idx". Esse índice HNSW é criado à mão
-- (não é expressável no schema Prisma) e foi removido daqui de propósito para
-- não derrubar a busca vetorial.

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "selection" TEXT;

-- CreateTable
CREATE TABLE "chapter_sections" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "end_offset" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "chapter_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chapter_sections_chapter_id_start_offset_idx" ON "chapter_sections"("chapter_id", "start_offset");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_sections_chapter_id_position_key" ON "chapter_sections"("chapter_id", "position");

-- AddForeignKey
ALTER TABLE "chapter_sections" ADD CONSTRAINT "chapter_sections_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
