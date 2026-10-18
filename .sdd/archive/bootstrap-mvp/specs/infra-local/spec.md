# Spec: Infraestrutura local

> Parte de [`bootstrap-mvp`](../../plan.md)

## Resumo

Docker Compose na raiz do monorepo sobe PostgreSQL com pgvector, Redis e MinIO para desenvolvimento local. Portas host e credenciais vêm do `.env` na raiz; `.env.example` documenta os defaults de desenvolvimento.

## Requirements

### REQ-1: Desenvolvedor sobe a infra local

- **Dado que** o Docker está instalado e o desenvolvedor copiou `.env.example` para `.env` na raiz
- **Quando** o desenvolvedor executa `docker compose up -d` na raiz do repositório
- **Então** o serviço PostgreSQL (pgvector) fica disponível na porta host definida em `POSTGRES_PORT` do `.env` (default `5436`)
- **E** o serviço Redis fica disponível na porta host definida em `REDIS_PORT` do `.env` (default `6380`)
- **E** o serviço MinIO fica disponível nas portas host `MINIO_API_PORT` (default `9000`) e `MINIO_CONSOLE_PORT` (default `9001`)
- **E** os três serviços reportam healthy nos healthchecks do Compose em até 60 segundos

### REQ-2: Variáveis de ambiente documentadas

- **Entrada** arquivo `.env.example` na raiz com credenciais e portas de desenvolvimento
- **Saída** variáveis de porta `POSTGRES_PORT`, `REDIS_PORT`, `MINIO_API_PORT` e `MINIO_CONSOLE_PORT` com defaults `5436`, `6380`, `9000` e `9001`
- **E** variáveis de conexão `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` e `MINIO_BUCKET=ebooks` montadas com as mesmas portas do `.env`
- **E** `docker-compose.yml` lê portas e credenciais via interpolação `${VAR}` do `.env` da raiz
- **E** comentários indicando que `.env` não é versionado

### REQ-2-bis: Portas parametrizadas no Compose

- **Entrada** `docker-compose.yml` na raiz com mapeamentos `${POSTGRES_PORT}:5432`, `${REDIS_PORT}:6379`, `${MINIO_API_PORT}:9000` e `${MINIO_CONSOLE_PORT}:9001`
- **Saída** alterar portas no `.env` reflete no bind host sem editar o compose
- **Erro** variável de porta ausente no `.env` → Compose falha na interpolação  ||  `.env.example` deve listar todas com default explícito

### REQ-3: PostgreSQL com imagem pgvector

- **Entrada** `docker compose up` com serviço PostgreSQL
- **Saída** container usa imagem com suporte a pgvector, banco `leitor_ebook_ia` criado via `POSTGRES_DB`
- **E** extensão `vector` **não** é habilitada pelo Compose  ||  fica na primeira migration Prisma (`backend-core`)

### REQ-4: Bucket MinIO para ebooks

- **Entrada** primeiro boot do serviço MinIO (container único)
- **Saída** bucket `ebooks` existente e acessível com as credenciais do `.env.example`
- **E** bucket criado pelo entrypoint customizado do mesmo container (`docker/minio/entrypoint.sh`) via `mc mb --ignore-existing`
- **E** sem serviço init separado no Compose

### REQ-5: Scripts de conveniência na raiz

- **Entrada** `package.json` na raiz
- **Saída** scripts `docker:up` (`docker compose up -d`) e `docker:down` (`docker compose down`)

## Edge cases

- `docker compose down` sem `-v` preserva dados nos volumes nomeados
- `docker compose down -v` apaga volumes e exige rodar `prisma migrate` de novo e recriar bucket MinIO no próximo ciclo
- Porta host já em uso → `docker compose up` falha com erro explícito de bind  ||  ajustar `*_PORT` no `.env`
- Backend (`3026`) e frontend (`3027`) não são gerenciados pelo Compose  ||  continuam via `pnpm dev`
