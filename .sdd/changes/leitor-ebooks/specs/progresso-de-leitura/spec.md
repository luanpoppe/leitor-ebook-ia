# Spec: Progresso de leitura

> Parte de [`leitor-ebooks`](../../plan.md)

## Resumo

Guarda onde o leitor parou em cada livro — capítulo e offset em caracteres — e devolve esse ponto para retomar a leitura. Uma linha por livro, sobrescrita a cada avanço.

## Histórias do usuário

### HU-1: Voltar exatamente onde parei

> **Como** leitor, **quero** reabrir o livro no ponto em que deixei, **para** continuar a leitura sem procurar o parágrafo.

#### CT-01: Progresso salvo é devolvido

- **Dado que** `dom-casmurro.epub` está pronto e o leitor parou no capítulo 3, offset 1200
- **Quando** ele salva o progresso e reabre o livro depois
- **Então** a API devolve `chapterPosition: 3` e `offset: 1200`
- **E** devolve o `updatedAt` do último salvamento

#### CT-02: Livro nunca lido

- **Dado que** o leitor nunca abriu `dom-casmurro.epub`
- **Quando** ele consulta o progresso
- **Então** a API responde `204` sem corpo

#### CT-03: Progresso avança e sobrescreve

- **Dado que** o progresso está no capítulo 3, offset 1200
- **Quando** o leitor salva o capítulo 3, offset 4800
- **Então** a consulta seguinte devolve `offset: 4800`
- **E** existe apenas um progresso para o livro

#### CT-04: Posição de capítulo inexistente

- **Dado que** o livro tem 8 capítulos
- **Quando** o leitor tenta salvar o capítulo 9
- **Então** a API responde `404`
- **E** o progresso anterior continua intacto

#### CT-05: Offset além do capítulo

- **Dado que** o capítulo 3 tem 5.000 caracteres
- **Quando** o leitor tenta salvar offset 5.001
- **Então** a API responde `422`
- **E** o progresso anterior continua intacto

## Edge cases

- Livro inexistente → `404` no GET e no PUT
- Corpo inválido (posição zero, offset negativo, tipo errado) → `400` pela validação
- Livro `failed` ou `processing` → progresso pode ser lido e gravado  ||  a leitura em si continua bloqueada pela API de capítulos
- Livro excluído → o progresso some junto (cascade)
- Livro reprocessado e capítulo encurtado → o GET devolve o progresso gravado como está  ||  abrir o capítulo pode dar 404 e a tela decide voltar ao início
- Salvar duas vezes o mesmo ponto → mesmo resultado, sem linha duplicada

## Notas técnicas

### NT-1: Tabela e regra do ponto

Uma linha por livro, com o capítulo e o offset em caracteres (o mesmo offset da API de capítulos). O `PUT` faz upsert.

```json
// entra
{ "chapterPosition": 3, "offset": 1200 }
```

```json
// sai
{
  "bookId": "01a15f7c-befb-7209-8426-70f0db3e070d",
  "chapterPosition": 3,
  "offset": 1200,
  "updatedAt": "2026-10-22T20:15:00.000Z"
}
```

- **Posição inexistente** → `404` (`ChapterNotFoundError`).
- **Offset acima de `char_length` do capítulo** → `422` (`InvalidReadingProgressError`).
- **Livro inexistente** → `404` (`EbookNotFoundError`).

### NT-2: Contrato das rotas

- `GET /ebooks/:bookId/progress` → `200` com o progresso ou `204` sem corpo.
- `PUT /ebooks/:bookId/progress` → `200` com o progresso salvo.
- Body do PUT validado por Zod: `chapterPosition` inteiro ≥ 1, `offset` inteiro ≥ 0.
- Erros traduzidos pelo filtro atual: `400` validação, `404` livro/capítulo, `422` offset.

### NT-3: Quando o cliente grava

O contrato não impõe frequência; o comportamento esperado do leitor é:

- **Agendar uma gravação quando a posição muda** (capítulo ou offset), com debounce de ~2 s.
- **Não regravar enquanto a posição não muda** — ficar 1 hora no mesmo parágrafo não gera escritas.
- **Descarregar o pendente** ao trocar de capítulo, sair da tela ou fechar/ocultar a aba.

## Contratos expostos

- Rotas novas em `packages/backend/src/api/ebooks/` — referência definitiva quando os arquivos existirem.
