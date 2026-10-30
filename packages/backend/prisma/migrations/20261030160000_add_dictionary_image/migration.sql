-- AlterTable
ALTER TABLE "dictionary_entries" ADD COLUMN "image_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "dictionary_entries_image_id_key" ON "dictionary_entries"("image_id");

-- AddForeignKey
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "generated_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
