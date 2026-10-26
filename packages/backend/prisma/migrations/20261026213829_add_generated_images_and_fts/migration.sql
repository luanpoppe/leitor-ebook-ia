-- Nota: a migração gerada pelo Prisma também propunha
-- DROP INDEX "chunks_embedding_hnsw_idx". Esse índice HNSW é criado à mão
-- (não é expressável no schema Prisma) e foi removido daqui de propósito para
-- não derrubar a busca vetorial.

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "image_id" UUID;

-- CreateTable
CREATE TABLE "generated_images" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "conversation_id" UUID,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_images_book_created_idx" ON "generated_images"("book_id", "created_at" DESC);

-- CreateIndex
-- Busca textual (FTS) dos trechos, no mesmo idioma da interface.
CREATE INDEX "chunks_text_fts_idx" ON "chunks" USING gin (to_tsvector('portuguese', "text"));

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "generated_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
