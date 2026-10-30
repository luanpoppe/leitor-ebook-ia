# Marcações de texto

> Atualizado em 2026-10-30 — fontes: `packages/backend/src/highlights/**`, `packages/backend/src/chat/chat-highlights-tools.ts`, `packages/frontend/src/features/highlights/**`, `packages/frontend/src/features/reader/use-text-selection.ts`

## O que é

Marcações de passagens do livro em quatro tons claros: amarelo, verde, azul e rosa. O leitor seleciona texto no leitor (mouse ou toque), escolhe uma cor e a passagem fica destacada no modo página e na rolagem. A IA pode consultar todas as marcações do livro pelo chat.

## Como funciona

- **Dados** — tabela `highlights` (Prisma): `id`, `book_id`, `chapter_position`, `start_offset`, `end_offset`, `quote`, `color` (enum `highlight_color`: `yellow`, `green`, `blue`, `pink`), `created_at`/`updated_at`. Cascata ao excluir o livro.
- **Offsets** — `start_offset`/`end_offset` são code points dentro do texto do capítulo, os mesmos usados pela paginação, pelo progresso e por `char_length` no Postgres. O trecho é validado contra o texto real do capítulo e o backend deriva `quote` dessa fatia.
- **API** — `HighlightsModule` (`src/highlights`): `GET/POST /ebooks/:bookId/highlights`, `PATCH/DELETE /ebooks/:bookId/highlights/:highlightId` e `GET /highlights` (todas as marcações da biblioteca, com o livro). `EbooksExceptionFilter` traduz `HighlightNotFoundError` (404), `InvalidHighlightChapterError`/`InvalidHighlightRangeError` (422) e `HighlightOverlapError` (409).
- **Criação pela seleção** — `useTextSelection` encontra o parágrafo pelo `data-offset` e o capítulo pelo `data-position`, conta os code points entre o começo do parágrafo e cada extremidade da seleção e devolve os offsets absolutos. O menu flutuante (mouse) e a barra do leitor (toque) mostram as quatro cores.
- **Renderização** — `HighlightedText` divide o parágrafo em trechos e envolve cada interseção em `<mark data-color="...">`. A marcação não adiciona padding, então não muda a quebra de linha já medida pela paginação. `TextParagraphs` é compartilhado pelo modo página e pela rolagem para manter o offset de cada parágrafo.
- **Painel do leitor** — o botão "Marcações" abre `ReaderHighlightsDrawer`: lista as marcações do livro, filtra por cor e busca local, troca a cor de uma marcação, remove e leva ao trecho clicado. Ao pular, a tela guarda o ponto de origem e mostra "← Voltar para onde eu estava".
- **Página global** — `/marcacoes` lista todas as marcações, com filtro por livro, por cor e busca por trecho/livro/capítulo; cada cartão oferece "Abrir no livro" (link com `capitulo` + `offset`, que abre a leitura no trecho) e "Remover".
- **Chat** — `ChatHighlightsTools` expõe `listar_marcacoes` no livro da conversa, com filtros opcionais por cor (`amarelo`, `verde`, `azul`, `rosa`) e termo. A ferramenta só consulta; criar e remover continuam sendo ações do leitor.

## Decisões e porquês

- **Quatro cores fixas e claras** — o produto pediu tons suaves; o enum impede valores arbitrários e o CSS mantém contraste nos temas claro e sépia.
- **Offsets em code points** — é a unidade do backend e do progresso; usar índices UTF-16 do DOM deslocaria a marcação em trechos com emoji.
- **Quote derivada do capítulo no backend** — o cliente não pode inventar o texto marcado; a API fatia o capítulo pelos offsets e devolve a citação canônica.
- **Sem sobreposição** — duas marcações no mesmo intervalo confundiriam a renderização e a exclusão; a API devolve 409 e pede para remover a antiga.
- **Marcação não altera layout** — `<mark>` sem padding/borda preserva a paginação e a medição; a cor é só `background`.
- **Pular pelo painel reusa o retorno da citação** — o mesmo estado `returnPoint` da tela serve para voltar ao ponto anterior, sem duplicar a barra.
- **Chat só lê** — consultar marcações é seguro; criar/excluir exige seleção manual para não marcar o trecho errado por interpretação do modelo.

## Notas

- Limites: trecho de 2 a 4.000 code points; listagem do livro até 500 e global até 300 (padrão).
- A rolagem recarrega a janela no ponto pedido, mesmo quando o trecho já está na lista, porque ele pode estar virtualizado como espaçador.
- Reprocessar o livro pode mudar o texto/posição dos capítulos e deslocar os offsets; não há remapeamento automático das marcações.
- Testado manualmente: criação nas quatro cores pelo menu e pela barra, renderização nos modos página e rolagem, troca de cor, painel com filtro/remoção, salto e retorno, link com `offset` exato, página global com filtros, API e ferramenta `listar_marcacoes` no chat.
- Sem testes automatizados (config `tests: off`).
