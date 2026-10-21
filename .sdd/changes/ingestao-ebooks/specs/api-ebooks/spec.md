# Spec: API de ebooks

> Parte de [`ingestao-ebooks`](../../plan.md)

## Resumo

Expõe o envio do ebook, a estante com o status de cada livro e o reprocessamento de quem falhou. O upload responde na hora, guarda o arquivo, cria o livro e enfileira a ingestão; o leitor acompanha pelo status.

## Histórias do usuário

### HU-1: Eu envio meu ebook e recebo a confirmação

**Como** leitor, **quero** enviar o arquivo e saber que ele entrou na fila, **para** não ficar esperando o processamento na tela.

- **CT-01** — **Dado que** escolhi `dom-casmurro.epub` (2 MB), **Quando** envio pelo endpoint de upload, **Então** recebo `202` com o id do livro.
- **E** o livro nasce `pending` e a ingestão é enfileirada.
- **E** o cabeçalho `Location` aponta para o status do livro.

### HU-2: Eu vejo minha estante e o andamento

**Como** leitor, **quero** listar os ebooks e ver o status de cada um, **para** saber o que já está pronto e o que falhou.

- **CT-02** — **Dado que** tenho 3 ebooks enviados, **Quando** abro a listagem, **Então** vejo os 3 com título, formato e status, do mais recente para o mais antigo.
- **CT-03** — **Dado que** `dom-casmurro.epub` terminou de processar, **Quando** consulto o livro, **Então** vejo `ready` com título, autor e a URL da capa.
- **E** se falhou, vejo `failed` e a mensagem.

### HU-3: Eu tento de novo um livro que falhou

**Como** leitor, **quero** pedir o reprocessamento sem enviar o arquivo de novo, **para** recuperar um livro que falhou por problema temporário.

- **CT-04** — **Dado que** um livro está `failed`, **Quando** peço o reprocessamento, **Então** recebo `202`.
- **E** o livro volta para `pending` e um novo job é enfileirado.
- **CT-05** — **Dado que** o livro está `ready` ou `processing`, **Quando** peço o reprocessamento, **Então** recebo `409` com a explicação.

## Edge cases

- Arquivo acima do limite (50 MB) → `413` com a mensagem do limite.
- Formato não suportado (ex.: `.docx`) → `422` listando EPUB, PDF, TXT e MD.
- Arquivo vazio (0 byte) → `422`.
- Requisição sem o campo `file` → `400`.
- Mesmo conteúdo já enviado (hash igual) → `409` com o id do livro existente.
- Storage fora → `503`; o livro não fica órfão no catálogo.
- Fila fora → `503` e o livro recém-criado é removido (compensação), junto do objeto no storage.
- Livro inexistente em status/reprocess → `404`.
- Página pedida além do fim → lista vazia, sem erro.

## Notas técnicas

### NT-1: Upload

`POST /ebooks` com `multipart/form-data` (campo `file`). O arquivo é gravado no storage com a chave `<hash>.<ext>`; o formato sai da extensão. O hash é calculado durante a leitura do arquivo temporário.

```json
{
  "request": "POST /ebooks  (file=dom-casmurro.epub, 2.1 MB)",
  "status": 202,
  "body": { "id": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e", "status": "pending", "title": "dom-casmurro" },
  "headers": { "Location": "/ebooks/0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e" }
}
```

Erro: duplicado → `409` com `{ "id": "<existente>", "message": "Este ebook já está na estante." }`.

### NT-2: Listagem e status

`GET /ebooks?page=1&pageSize=20` devolve `{ items, page, pageSize, total }`, ordenado por `createdAt desc, id desc`. `GET /ebooks/:id` devolve o livro com `coverUrl` (URL pré-assinada de 1h) quando houver capa.

```json
{
  "items": [
    {
      "id": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e",
      "title": "Dom Casmurro",
      "author": "Machado de Assis",
      "format": "epub",
      "status": "ready",
      "createdAt": "2026-10-20T14:03:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

Erro: id inválido ou inexistente → `404`.

### NT-3: Reprocessamento

`POST /ebooks/:id/reprocess` só aceita `failed`; marca `pending` e enfileira de novo (o worker retoma do estágio que faltou).

```json
{
  "request": "POST /ebooks/0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e/reprocess",
  "status": 202,
  "body": { "id": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e", "status": "pending" }
}
```

Erro: `409` `{ "message": "Só é possível reprocessar um ebook que falhou." }`.

### NT-4: Erros

Todos os erros de domínio têm corpo `{ "statusCode": number, "message": string }`. `413` para tamanho, `422` para formato/vazio, `404` para livro ausente, `503` para storage ou fila indisponível.

```json
{ "statusCode": 422, "message": "Formato não suportado. Envie EPUB, PDF, TXT ou MD." }
```

## Contratos expostos

- `POST /ebooks` — upload multipart; `202` com `{ id, status, title }` e `Location` (novo; provisório até o chunk).
- `GET /ebooks` — listagem paginada (novo; provisório até o chunk).
- `GET /ebooks/:id` — detalhe com `coverUrl` (novo; provisório até o chunk).
- `POST /ebooks/:id/reprocess` — reprocessa `failed` (novo; provisório até o chunk).
- `FileStorageService.put` / `IngestionQueue.enqueue` — `packages/backend/src/storage/file-storage.service.ts` e `packages/backend/src/ingestion/ingestion.queue.ts`.
