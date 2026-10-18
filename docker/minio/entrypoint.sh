#!/bin/sh
set -e

# Um único container: sobe o MinIO e garante o bucket de ebooks via mc.
# Imagem: bitnamilegacy/minio (repo legacy pinado) — os binários não ficam no PATH por padrão,
# então adicionamos os diretórios do Bitnami antes de usar minio/mc.
# Credenciais e nome do bucket vêm do .env injetado pelo docker-compose (F2.C4).

export PATH="/opt/bitnami/minio/bin:/opt/bitnami/minio-client/bin:${PATH}"

MINIO_BUCKET="${MINIO_BUCKET:-ebooks}"
MINIO_USER="${MINIO_ROOT_USER:-${MINIO_ACCESS_KEY:-minioadmin}}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-${MINIO_SECRET_KEY:-minioadmin}}"
# Diretório de dados do Bitnami (gravável pelo usuário 1001 da imagem).
MINIO_DATA_DIR="${MINIO_DATA_DIR:-/bitnami/minio/data}"
WAIT_TIMEOUT="${MINIO_INIT_TIMEOUT:-60}"

minio server "${MINIO_DATA_DIR}" --console-address ":9001" &
minio_pid=$!

elapsed=0

echo "Aguardando MinIO local (timeout ${WAIT_TIMEOUT}s)..."

while ! mc alias set local http://127.0.0.1:9000 "${MINIO_USER}" "${MINIO_PASS}" >/dev/null 2>&1; do
  if ! kill -0 "${minio_pid}" 2>/dev/null; then
    echo "Erro: processo MinIO encerrou antes de ficar pronto." >&2
    exit 1
  fi

  if [ "${elapsed}" -ge "${WAIT_TIMEOUT}" ]; then
    echo "Erro: MinIO não ficou pronto em ${WAIT_TIMEOUT}s." >&2
    exit 1
  fi

  sleep 1
  elapsed=$((elapsed + 1))
done

echo "Garantindo bucket '${MINIO_BUCKET}'..."
mc mb "local/${MINIO_BUCKET}" --ignore-existing
echo "Bucket '${MINIO_BUCKET}' disponível."

wait "${minio_pid}"
