# Spec: Pipeline de ingestão

> Parte de [`ingestao-ebooks`](../../plan.md)

## Resumo

O worker da fila pega o ebook que foi para o storage, extrai o conteúdo, gera os chunks com embeddings e atualiza o status do livro — sozinho, com retry em falha transitória e sem repetir o trabalho já feito.

## Histórias do usuário

### HU-1: O livro fica pronto sem eu fazer nada

**Como** leitor, **quero** que o ebook que enviei seja processado em segundo plano, **para** não precisar esperar na tela nem repetir o envio.

- **CT-01** — **Dado que** `dom-casmurro.epub` foi salvo no storage e o livro foi enfileirado, **Quando** o worker pega o job, **Então** o livro passa de `pending` para `processing`.
- **E** o conteúdo é extraído, dividido em trechos e vetorizado.
- **E** ao terminar, o livro fica `ready`.

### HU-2: Eu sei quando algo deu errado

**Como** leitor, **quero** ver que o livro falhou e por quê, **para** decidir se reenvio ou tento de novo.

- **CT-02** — **Dado que** a IA falhou na primeira tentativa e voltou na segunda, **Quando** o retry termina, **Então** o livro fica `ready`.
- **CT-03** — **Dado que** o arquivo sumiu do storage, **Quando** as 3 tentativas se esgotam, **Então** o livro fica `failed`.
- **E** a mensagem diz que o arquivo não foi encontrado.

### HU-3: A retomada não repete o que já foi feito

**Como** leitor, **quero** que o reprocessamento aproveite o que já foi extraído e vetorizado, **para** o livro ficar pronto mais rápido.

- **CT-04** — **Dado que** o livro falhou com 80 trechos sem embedding, **Quando** o reprocessamento roda, **Então** só os 80 trechos são enviados à API.
- **E** o arquivo original não é extraído de novo.
- **CT-05** — **Dado que** o livro falhou antes de extrair (sem capítulos), **Quando** o reprocessamento roda, **Então** o arquivo é baixado do storage e extraído de novo.

## Edge cases

- Livro inexistente no banco → job falha sem retry (erro definitivo) e registra o id.
- Mesmo livro enfileirado duas vezes → o BullMQ descarta a duplicata enquanto o primeiro job está na fila ou ativo.
- Redis indisponível no enfileiramento → erro de fila indisponível, sem job fantasma.
- Job travado/alto tempo (livro grande) → o worker mantém o lock renovado; ao esgotar as tentativas, `failed`.
- Capa acima do limite ou extração inválida → falha de conteúdo, com a mensagem da extração.
- Livro sem nenhum trecho após indexar → não vira `ready`; `failed` com a contagem.

## Notas técnicas

### NT-1: Fila e job

Fila `ebook-ingestion`; payload só com o id do livro. `jobId` = id do livro; 3 tentativas com backoff exponencial (5s, 30s, 2min); jobs concluídos removidos e falhos mantidos para inspeção.

```json
{
  "queue": "ebook-ingestion",
  "jobId": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e",
  "data": { "bookId": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e" },
  "opts": { "attempts": 3, "backoff": { "type": "exponential", "delay": 5000 } }
}
```

Erro: Redis ausente → `QueueUnavailableError` ao enfileirar.

### NT-2: Fluxo do worker

1. Carrega o livro; inexistente → erro definitivo (sem retry).
2. Marca `processing`.
3. Decide o estágio:
   - sem capítulos → baixa o arquivo do storage, extrai (`ContentExtractor`), prepara chunks/embeddings (`ContentIndexingService.prepare`) e grava (`replaceContent`);
   - com capítulos e trechos pendentes → `resumeMissing` (sem baixar nem extrair).
4. Se `remaining > 0` ou `total = 0` → `failed` com `incompleteMessage`, e o job falha para o retry.
5. Caso contrário → `ready`.

```json
{
  "input": { "bookId": "0199c1f2-8f3a-7c4b-9d21-5a6e0b1c2d3e" },
  "output": { "stage": "index", "status": "ready", "chapters": 12, "embedded": 340, "remaining": 0 }
}
```

Erro: falha de extração/IA → `failed` com a mensagem e o job relança para o BullMQ contar a tentativa.

### NT-3: Mensagens de falha

A mensagem vai em `books.error_message`, curta e legível: a mensagem da extração (ex.: `PDF sem texto extraível`), a de fila/IA (ex.: `Embeddings desativados: OPENROUTER_API_KEY não configurada.`) ou `Indexação incompleta: 80 trechos sem embedding.`

```json
{ "status": "failed", "error_message": "PDF sem texto extraível" }
```

## Contratos expostos

- `IngestionQueue.enqueue(bookId)` — enfileira a ingestão e devolve o id do job (novo; provisório até o chunk).
- `QueueUnavailableError` — Redis ausente ao enfileirar (novo; provisório até o chunk).
- Transições de `books.status`: `pending → processing → ready | failed` — schema em `packages/backend/prisma/schema.prisma`.
