# Spec: Chunking e embeddings

> Parte de [`ingestao-ebooks`](../../plan.md)

## Resumo

Divide o texto de cada capítulo em trechos e gera o embedding de cada um no pgvector, para o leitor conseguir encontrar passagens do livro e o chat RAG ter o que recuperar. Se a geração falhar no meio, o que já foi vetorizado é preservado e o reprocessamento completa só o que falta.

## Histórias do usuário

### HU-1: O leitor consegue buscar dentro do livro

**Como** leitor, **quero** que o livro fique dividido em trechos pesquisáveis, **para** encontrar a passagem que procuro sem reler o livro inteiro.

- **CT-01** — **Dado que** `dom-casmurro.epub` virou 3 capítulos, **Quando** a indexação roda, **Então** cada capítulo vira trechos de até ~1.000 caracteres.
- **E** trechos vizinhos compartilham ~150 caracteres de contexto.
- **E** cada trecho guarda a posição dele dentro do capítulo.
- **CT-02** — **Dado que** um capítulo tem um único parágrafo curto, **Quando** a indexação roda, **Então** ele vira 1 trecho com o texto completo.

### HU-2: O livro não é perdido quando a IA falha

**Como** leitor, **quero** que a ingestão possa ser retomada depois de uma falha da IA, **para** não esperar o livro inteiro ser processado de novo.

- **CT-03** — **Dado que** a API de embedding falhou depois de vetorizar 40 de 120 trechos, **Quando** a indexação termina, **Então** o livro fica `failed`.
- **E** os 40 embeddings já gravados continuam no banco.
- **E** a mensagem de erro indica que a indexação ficou incompleta.
- **CT-04** — **Dado que** o livro falhou com 80 trechos sem embedding, **Quando** a ingestão é reprocessada, **Então** só esses 80 trechos são enviados à API.
- **E** os 40 já vetorizados não são recalculados.

### HU-3: O leitor vê o livro pronto só quando tudo é pesquisável

**Como** leitor, **quero** que o livro só apareça como pronto quando todos os trechos tiverem embedding, **para** não buscar em um livro com buracos.

- **CT-05** — **Dado que** todos os trechos de `dom-casmurro.epub` receberam embedding, **Quando** a indexação termina, **Então** o livro fica `ready`.

## Edge cases

- Parágrafo maior que o alvo (ex.: 4.000 caracteres) → quebrado em trechos do tamanho alvo, preferindo fim de frase.
- Chunk grande demais para o modelo (acima do limite de entrada) → quebrado antes de chamar a API.
- IA não configurada (sem `OPENROUTER_API_KEY`) → conteúdo salvo, livro `failed`; reprocessamento tenta de novo.
- Timeout ou rate limit da API → mesmo tratamento da falha: parcial preservado, livro `failed`.
- Reprocessamento sem trechos faltantes → não chama a API.
- Capítulo sem texto útil → não gera trecho (a extração já descarta capítulo vazio).

## Notas técnicas

### NT-1: Chunking

Junta parágrafos até o alvo de 1.000 caracteres, sem cortar palavra, e repete o fim do trecho anterior (~150 caracteres) no começo do próximo. Parágrafo maior que o alvo é quebrado no fim de frase mais próximo.

```json
{
  "input": { "chapterPosition": 1, "text": "CAPÍTULO PRIMEIRO\n\nUma noite destas, vindo da cidade para o Engenho Novo...\n\n[...]" },
  "output": [
    { "position": 1, "text": "CAPÍTULO PRIMEIRO\n\nUma noite destas, ... (≈1.000 chars)" },
    { "position": 2, "text": "... (≈150 chars do fim do anterior) + continuação" }
  ]
}
```

Erro: não há — texto vazio já foi descartado antes desta etapa.

### NT-2: Embeddings

Usa `AIEmbeddings.embedDocuments` de `@luanpoppe/ai`, modelo `openrouter/openai/text-embedding-3-small` com `dimensions: 1536`, via OpenRouter. Os textos vão em lotes de 64.

```json
{
  "input": ["Uma noite destas, vindo da cidade para o Engenho Novo...", "..."],
  "output": [[0.0123, -0.0456, "... 1.536 valores"], ["..."]]
}
```

Erro: falha da API/cliente ausente → `EmbeddingUnavailableError` com a causa; o serviço decide entre preservar o parcial e marcar `failed`.

### NT-3: Persistência e retomada

`chunks.embedding` passa a aceitar nulo. O reprocessamento lê os trechos sem embedding do livro e só eles vão para a API; os já vetorizados ficam intactos.

```json
{
  "input": { "bookId": "0199c1f2-...", "chunkIdsWithoutEmbedding": ["0199c1f2-a1", "0199c1f2-a2"] },
  "output": { "embedded": 2, "remaining": 0 }
}
```

Erro: se restar algum trecho sem embedding após o lote, o livro fica `failed` com a contagem restante na mensagem.

## Contratos expostos

- `chunks.embedding` passa a ser nulável — migration nova; schema em `packages/backend/prisma/schema.prisma`.
- `EbookRepository.replaceContent` passa a aceitar trecho sem embedding, e ganha leitura e atualização dos trechos faltantes — `packages/backend/src/catalog/ebook.repository.ts` (provisório até o chunk).
- `ContentIndexingService` (novo) expõe a indexação de capítulos e a retomada dos faltantes (provisório até o chunk).
