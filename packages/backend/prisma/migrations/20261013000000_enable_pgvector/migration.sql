-- Habilita pgvector (extensão `vector`).
-- Idempotente: reexecutar é no-op. Requer role superusuário (dev usa `postgres`).
CREATE EXTENSION IF NOT EXISTS vector;
