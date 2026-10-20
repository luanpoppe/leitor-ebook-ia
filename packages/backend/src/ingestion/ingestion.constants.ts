/**
 * Configuração de comportamento da fila de ingestão — hardcoded de propósito,
 * não é variável de ambiente.
 */
export const INGESTION_QUEUE_NAME = 'ebook-ingestion';
export const INGESTION_JOB_NAME = 'ingest-book';
export const INGESTION_JOB_ATTEMPTS = 3;
export const INGESTION_BACKOFF_DELAY_MS = 5000;
/** Tempo máximo que o `enqueue` espera o Redis responder antes de falhar. */
export const INGESTION_ENQUEUE_TIMEOUT_MS = 5000;
