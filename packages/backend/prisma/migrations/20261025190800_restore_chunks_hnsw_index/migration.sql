-- Restaura o índice HNSW dos embeddings, removido pela migração anterior.
-- Esse índice é criado à mão (não é expressável no schema Prisma) e não deve
-- ser derrubado por migrações geradas.
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
