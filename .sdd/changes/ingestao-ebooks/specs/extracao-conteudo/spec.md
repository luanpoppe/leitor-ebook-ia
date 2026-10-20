# Spec: Extração de conteúdo

> Parte de [`ingestao-ebooks`](../../plan.md)

## Resumo

Transforma o arquivo do ebook em capítulos com texto limpo — mais título, autor e capa quando existirem —, para a ingestão gerar os chunks e o leitor ter a estrutura do livro.

## Histórias do usuário

### HU-1: O leitor recebe um ebook estruturado

**Como** leitor, **quero** que o ebook enviado vire capítulos em ordem, **para** navegar pelo livro e consultar o conteúdo.

- **CT-01** — **Dado que** enviei `dom-casmurro.epub` (2 MB) com 3 capítulos, **Quando** a ingestão extrai o conteúdo, **Então** o ebook fica com 3 capítulos na ordem do livro.
- **E** cada capítulo tem o texto sem cabeçalho/rodapé repetido.
- **CT-02** — **Dado que** enviei um PDF com outline de 5 capítulos, **Quando** a extração roda, **Então** os capítulos seguem o outline.
- **E** o texto do sumário não aparece no conteúdo dos capítulos.

### HU-2: O leitor vê título, autor e capa

**Como** leitor, **quero** ver o título, o autor e a capa do livro, **para** reconhecê-lo na minha estante.

- **CT-03** — **Dado que** o EPUB tem metadata title "Dom Casmurro", creator "Machado de Assis" e capa JPEG, **Quando** a extração roda, **Então** o ebook fica com esses valores.
- **E** a capa é guardada no storage e o `cover_storage_key` aponta para ela.
- **CT-04** — **Dado que** o arquivo não tem metadata, **Quando** a extração roda, **Então** o título continua sendo o nome do arquivo.
- **E** autor e capa ficam nulos.

### HU-3: O leitor é avisado quando o arquivo não tem texto

**Como** leitor, **quero** saber quando um arquivo não pode ser lido, **para** não esperar por algo que nunca vai ficar pronto.

- **CT-05** — **Dado que** enviei `escaneado.pdf` (sem camada de texto), **Quando** a extração roda, **Então** ela falha com "PDF sem texto extraível".
- **E** o ebook fica `failed` com essa mensagem.

## Edge cases

- EPUB sem capítulos identificáveis (ex.: um único HTML sem headings) → 1 capítulo com o texto integral.
- PDF sem outline → capítulos por heurística de títulos; se nenhum título for reconhecido, 1 capítulo.
- TXT/Markdown sem headings nem linha de capítulo → 1 capítulo.
- Capa em formato inesperado (ex.: SVG dentro do EPUB) → capa ignorada (nula); a extração segue.
- Arquivo corrompido/truncado → erro de conteúdo com mensagem clara (ebook `failed`).
- Texto que sobra só com espaços após a normalização → capítulo descartado; se não sobrar nenhum, falha de conteúdo.

## Notas técnicas

### NT-1: Contrato do extrator

Recebe o stream e o formato e devolve capítulos, texto integral e metadados.

```json
{
  "input": { "format": "epub", "stream": "<Readable do storage>" },
  "output": {
    "chapters": [{ "position": 1, "text": "CAPÍTULO PRIMEIRO\n\nUma noite destas..." }],
    "fullText": "CAPÍTULO PRIMEIRO\n\nUma noite destas...",
    "metadata": {
      "title": "Dom Casmurro",
      "author": "Machado de Assis",
      "cover": { "contentType": "image/jpeg", "hash": "9b2e…", "extension": "jpg" }
    }
  }
}
```

Erro: PDF sem texto → `ContentExtractionError('PDF sem texto extraível')`.

### NT-2: Normalização de texto

Remove o lixo de layout antes de o texto virar chunk.

```json
{ "input": "line-\nbreak  com   espaços\n\n\n", "output": "linebreak com espaços" }
```

Erro: texto vazio depois de normalizar → o capítulo é descartado.

### NT-3: Capa

A capa vira um objeto no bucket em `covers/<hash>.<ext>`, e `Book.cover_storage_key` aponta para ele.

```json
{ "input": { "hash": "9b2e…", "extension": "jpg" }, "output": "covers/9b2e….jpg" }
```

Erro: sem capa → `cover_storage_key` nulo.

### NT-4: Detecção de capítulos em TXT/Markdown

Reconhece headings Markdown e linhas de título de capítulo (`Capítulo`/`Capitulo`/`Cap.`/`Chapter`/`Ch.` + número ou romano, sem diferenciar maiúsculas).

```json
{ "input": "## Capítulo 1\nTexto\n\nCAPÍTULO II\nMais texto", "output": [{ "position": 1, "text": "Texto" }, { "position": 2, "text": "Mais texto" }] }
```

Erro: nenhum heading/linha reconhecida → 1 capítulo com o texto todo.

## Contratos expostos

- `Book` ganha `author` (nullable) e `cover_storage_key` (nullable) — migração nova; schema em `packages/backend/prisma/schema.prisma`.
- `FileStorageService.putObject` — `packages/backend/src/storage/file-storage.service.ts:FileStorageService.putObject`.
- `ContentExtractor.extract` — `packages/backend/src/extraction/content-extractor.ts:ContentExtractor.extract`.
- `ContentExtractionError` — `packages/backend/src/extraction/content.types.ts:ContentExtractionError`.
