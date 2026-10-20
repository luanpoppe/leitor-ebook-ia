# Extração de conteúdo

> Atualizado em 2026-10-20 · fontes: `packages/backend/src/extraction/**`

## O que é

Transforma o arquivo enviado (EPUB, PDF, TXT ou Markdown) em capítulos com texto normalizado, mais título, autor e capa quando o próprio arquivo traz essa informação. É a etapa que dá estrutura ao livro antes do chunking e da leitura.

## Como funciona

- `ContentExtractor` (`src/extraction/content-extractor.ts`) é o ponto único: escolhe o parser pelo `BookFormat` (TXT e MD compartilham o `TxtParser`), chama `parse(stream)` e devolve `ExtractedContent` (capítulos, `fullText`, título/autor, `coverStorageKey`).
- Se o parser devolve capa, o extractor bufferiza o stream, monta `covers/<hash>.<ext>` e grava com `FileStorageService.putObject`. Sem capa, `coverStorageKey` fica indefinido.
- EPUB (`epub-parser.ts` + `src/extraction/epub/`): lê `container.xml` e o OPF, segue o spine, remove o documento do sumário (nav EPUB3 / NCX EPUB2), converte XHTML em texto e extrai título/autor/capa do pacote.
- PDF (`pdf-parser.ts` + `src/extraction/pdf/`): usa `pdfjs-dist` (build legacy, o único que roda em Node), extrai texto por página e usa o outline para delimitar capítulos; sem outline, cai numa heurística de linhas de título.
- TXT/Markdown (`txt-parser.ts`): divide por heading Markdown e por linhas `Capítulo/Capitulo/Cap./Chapter/Ch.` + número ou romano; sem marcador, o arquivo inteiro vira um capítulo.
- `TextNormalizer` (`text-normalizer.ts`) padroniza o texto (hifenização, espaços, cabeçalho/rodapé repetido) e `normalizeChapters` descarta capítulo vazio e renumera.
- `ContentExtractionError` é o erro de domínio; a ingestão traduz para `failed` com a mensagem. PDF sem camada de texto usa a mensagem exata `PDF sem texto extraível`.

## Decisões e porquês

- **Parser EPUB dividido em módulos** (`epub/`): o arquivo único passava de 600 linhas; a separação (archive, package, toc, cover, html-to-text) mantém cada peça abaixo do limite do projeto sem mudar o comportamento.
- **`pdfjs-dist` em vez de `pdf-parse`**: é a única lib madura que entrega texto por página **e** outline na mesma API. O build legacy é obrigatório em Node (o normal exige `DOMMatrix`), e `isEvalSupported: false` desliga JS embutido no PDF.
- **Sumário removido por arquivo no EPUB e por corte de páginas no PDF**: o sumário não deve virar conteúdo do livro (CT-02). No EPUB o arquivo do nav/NCX é excluído; no PDF as páginas anteriores ao primeiro capítulo do outline são descartadas.
- **Heurística de títulos sem outline**: PDFs sem bookmark não têm estrutura confiável; a linha `Capítulo/Chapter + número/romano` e o título curto isolado são a melhor pista disponível.
- **TXT/MD sem metadata**: título e autor ficam vazios de propósito — o pipeline usa o nome do arquivo como título quando não há metadata (CT-04).
- **Capa bufferizada no extractor**: o contrato `ExtractedCover` não carrega o tamanho exigido pelo `putObject`; como capa é pequena, bufferizar é aceitável.
- **Falha ao gravar a capa propaga**: storage fora do ar derruba a ingestão de qualquer forma; esconder a capa nula mascararia a falha.
- **Capa em formato não suportado (ex.: SVG) é ignorada**: o storage só aceita jpg/png/gif/webp, e a extração segue sem capa.

## Notas

- O hash da capa é SHA-256 do buffer — a mesma convenção content-addressed do arquivo do ebook.
- `ContentExtractionModule` provê os três parsers e o `ContentExtractor`, importa `FileStorageModule` e exporta só o `ContentExtractor`.
- A feature não altera o índice HNSW de `chunks`.
