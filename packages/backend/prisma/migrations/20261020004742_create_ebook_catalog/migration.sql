-- CreateEnum
CREATE TYPE "book_format" AS ENUM ('epub', 'pdf', 'txt', 'md');

-- CreateEnum
CREATE TYPE "book_status" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "format" "book_format" NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "book_status" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "books_title_not_blank_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "books_size_bytes_positive_check" CHECK ("size_bytes" > 0),
    CONSTRAINT "books_error_message_only_when_failed_check" CHECK ("status" = 'failed' OR "error_message" IS NULL)
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chapters_position_positive_check" CHECK ("position" >= 1),
    CONSTRAINT "chapters_text_not_blank_check" CHECK (btrim("text") <> '')
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chunks_position_positive_check" CHECK ("position" >= 1),
    CONSTRAINT "chunks_text_not_blank_check" CHECK (btrim("text") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "books_hash_key" ON "books"("hash");

-- CreateIndex
CREATE INDEX "books_created_at_idx" ON "books"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "chapters_book_id_position_key" ON "chapters"("book_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_chapter_id_position_key" ON "chunks"("chapter_id", "position");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice vetorial para busca por similaridade de cosseno (pgvector).
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
