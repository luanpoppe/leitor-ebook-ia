# Spec: Catálogo de ebooks

> Parte de [`ingestao-ebooks`](../../plan.md)

## Resumo

Modelo de domínio e persistência da ingestão: o registro do ebook com o seu ciclo de status, os capítulos extraídos e os trechos (chunks) com o embedding vetorial. É a base que o worker grava ao processar e que a API e a tela consultam.

## Requirements

### REQ-1: Worker grava a ingestão concluída

- **Dado que** o worker extraiu os capítulos e gerou os embeddings de um ebook em `processing`
- **Quando** ele grava o resultado pelo repositório
- **Então** os capítulos são gravados em ordem, cada um com o seu texto
- **E** os chunks são gravados com o texto e o embedding `vector(1536)`
- **E** o ebook passa a `ready`

### REQ-2: Ciclo de status do ebook

- **Entrada** ebook recém-criado no upload
- **Saída** status `pending`
- **E** o worker muda para `processing` ao começar e para `ready` ao concluir
- **Erro** falha na ingestão → status `failed` com a mensagem do erro gravada; uma nova tentativa volta para `processing`

### REQ-3: Upload duplicado por hash

- **Dado que** já existe um ebook com o mesmo hash do arquivo enviado
- **Quando** o cliente envia o arquivo de novo
- **Então** o upload é recusado com conflito (`409`)
- **E** a resposta aponta o `id` do ebook que já existe

### REQ-4: Sempre ao menos um capítulo

- **Entrada** extração que não identificou nenhum capítulo
- **Saída** um único capítulo com o texto integral do ebook, na posição `1`
- **Erro** ebook com zero capítulos não pode ser persistido

### REQ-5: Reprocessamento substitui o resultado anterior

- **Entrada** ebook que já tem capítulos e chunks de uma tentativa anterior
- **Saída** a gravação apaga os antigos e grava os novos na mesma transação; nada é duplicado
- **Erro** falha no meio da gravação → rollback: nem apaga os antigos, nem grava os novos

### REQ-6: Dados do ebook no upload

- **Entrada** arquivo `Dom Casmurro.epub`, 1,2 MB, hash `a3f1c9…`, formato `epub`
- **Saída** `Book` com título `Dom Casmurro`, formato `epub`, tamanho, hash, `storageKey` e status `pending`
- **Erro** falta de título, formato, tamanho, hash ou `storageKey` → a criação é rejeitada

### REQ-7: Título do ebook

- **Entrada** arquivo `Dom Casmurro.epub` sem metadata de título; depois a extração encontra o título "Dom Casmurro" na metadata
- **Saída** no upload, título = nome do arquivo sem extensão (`Dom Casmurro`)
- **E** a extração pode atualizar o título com o valor da metadata

## Edge cases

- Duas tentativas do mesmo ebook concorrendo (retry): a substituição transacional evita duplicar; a última transação que commitar vence.
- Chunk sem embedding → a gravação falha e o ebook vai para `failed`; nenhum chunk sem vetor é gravado.
- Ebook grande (centenas de chunks) → gravação em lote dentro da transação, para não estourar tempo/limite.
- Hash já existente de um ebook com status `failed` → ainda é duplicata: o mesmo conteúdo não é reenfileirado (o retry é do ebook existente).

## Contratos expostos

- Tabelas `books`, `chapters` e `chunks` (novas; provisório até o chunk de dados): `packages/backend/prisma/schema.prisma`.
- `books.hash` é único; conflito de duplicata responde `409` (consumido pela API de upload em `F7`).
- `chunks.embedding`: coluna `vector(1536)`.
