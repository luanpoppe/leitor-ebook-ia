# Spec: Tela de leitura

> Parte de [`leitor-ebooks`](../../plan.md)

## Resumo

Uma tela dedicada para ler o ebook capítulo a capítulo, com sumário, tipografia ajustável e navegação por teclado. Ao abrir, retoma o ponto salvo e passa a gravar o avanço; a entrada é a ficha do livro ou o atalho de leitura no cartão da estante.

## Histórias do usuário

### HU-1: Voltar ao ponto em que parei

> **Como** leitor, **quero** abrir o livro e cair direto onde deixei, **para** não procurar o parágrafo de novo.

#### CT-01: Retomada do ponto salvo

- **Dado que** `dom-casmurro.epub` está pronto e o progresso está no capítulo 3, offset 1200
- **Quando** o leitor abre `/ebooks/<id>/ler`
- **Então** a tela mostra o capítulo 3, rolada até o offset 1200
- **E** o sumário aberto marca o capítulo 3 como atual

#### CT-02: Primeira abertura

- **Dado que** o leitor nunca abriu o livro
- **Quando** ele entra na tela de leitura
- **Então** o capítulo 1 aparece desde o começo
- **E** nenhum aviso de retomada é exibido

#### CT-03: Progresso gravado enquanto leio

- **Dado que** o leitor está no capítulo 3 e rola até outro parágrafo
- **Quando** ele fica 2 segundos sem rolar
- **Então** o ponto novo é gravado
- **E** ao sair e voltar, a tela reabre nesse ponto

### HU-2: Andar pelo livro

> **Como** leitor, **quero** pular para outro capítulo e chegar ao fim sem me perder, **para** ler na ordem que eu quiser.

#### CT-04: Pular pelo sumário

- **Dado que** a tela de leitura está aberta
- **Quando** o leitor abre o sumário e escolhe o capítulo 6
- **Então** a tela mostra o capítulo 6 desde o começo
- **E** o sumário fecha

#### CT-05: Trocar de capítulo pelo teclado

- **Dado que** o leitor está no capítulo 3 com o sumário fechado
- **Quando** ele pressiona a seta para a direita
- **Então** a tela mostra o capítulo 4 desde o começo
- **E** a seta para a esquerda o devolve ao capítulo 3

#### CT-06: Chegar ao fim do livro

- **Dado que** o leitor está no último capítulo
- **Quando** ele avança além dele
- **Então** a tela mostra o fim do livro
- **E** oferece voltar à estante ou reler desde o primeiro capítulo

### HU-3: Ler do jeito que meus olhos aguentam

> **Como** leitor, **quero** ajustar o tamanho do texto e o fundo da página, **para** ler por mais tempo sem cansar.

#### CT-07: Ajuste vale para a próxima abertura

- **Dado que** o leitor aumentou a fonte duas vezes e escolheu o tema sépia
- **Quando** ele fecha o navegador e abre outro livro
- **Então** o texto continua maior e no tema sépia
- **E** os controles mostram o estado escolhido

### HU-4: Entender quando o livro não pode ser lido

> **Como** leitor, **quero** saber por que o livro não abriu e como sair da tela, **para** não ficar olhando para uma página em branco.

#### CT-08: Livro ainda em preparo

- **Dado que** `dom-casmurro.epub` está com status `processing`
- **Quando** o leitor abre a tela de leitura
- **Então** a tela explica que o livro ainda está sendo preparado
- **E** oferece voltar à ficha do livro

#### CT-09: Capítulo que sumiu no reprocessamento

- **Dado que** o progresso aponta para o capítulo 8 de um livro que agora tem 6
- **Quando** o leitor abre a tela de leitura
- **Então** a tela avisa que o capítulo não existe mais
- **E** oferece voltar ao primeiro capítulo ou à ficha do livro

## Edge cases

- Livro inexistente (id inválido ou apagado) → mesma tela de aviso, com volta à estante
- Falha ao gravar o progresso → a leitura continua  ||  a próxima mudança de posição tenta de novo
- Fechar a aba ou ocultá-la com gravação pendente → grava antes de sair
- Livro com 100+ capítulos → o sumário rola dentro do próprio painel
- Celular → sumário e controles continuam acessíveis, sem depender de teclado
- Fonte no tamanho máximo → a coluna de texto continua legível, sem rolagem horizontal

## Notas técnicas

### NT-1: De onde a tela lê

A tela consome rotas que já existem. Referência: `packages/frontend/src/features/ebooks/api.ts` (cliente `api`), `packages/backend/src/api/ebooks/chapters.schemas.ts` (`ChapterListResponse`, `ChapterContentResponse`) e `packages/backend/src/api/ebooks/progress.schemas.ts` (`ReadingProgressResponse`).

O sumário (`GET /ebooks/:bookId/chapters`) devolve `{ items: [{ id, position, title, wordCount }] }`; a página (`GET /ebooks/:bookId/chapters/:position?offset&limit`) devolve:

```json
{
  "id": "…", "position": 3, "title": "Capítulo III",
  "text": "…texto do capítulo…",
  "offset": 0, "limit": 50000, "nextOffset": 50000, "totalLength": 53872,
  "previousPosition": 2, "nextPosition": 4
}
```

O progresso (`GET/PUT /ebooks/:bookId/progress`, corpo `{ chapterPosition, offset }`) devolve `{ bookId, chapterPosition, offset, updatedAt }`.

- **Livro ou capítulo inexistente** → `404`  ||  **livro fora de `ready`** → `409`  ||  **offset acima do capítulo** → `422`.
- **Sem progresso** → `204` sem corpo, e a tela abre no capítulo 1.

### NT-2: Quando o progresso é gravado

- Agenda gravação **só quando a posição muda** (capítulo ou offset), com debounce de **2 s**; ficar parado no mesmo parágrafo não escreve.
- Descarrega o pendente ao trocar de capítulo, sair da tela e no `visibilitychange` para aba oculta.
- Falha no `PUT` não interrompe a leitura  ||  o ponto fica em memória e a próxima mudança tenta de novo.
- A posição salva é a do **início do trecho visível** no topo da área de leitura, em caracteres do capítulo.

### NT-3: Preferências de leitura

- Fonte em 5 passos — 16, 18, 20, 22 e 24 px — com **18 px** como padrão.
- Temas `light` e `sepia`, com **light** como padrão; o tema pinta só a superfície de leitura (coluna, texto e barra), mantendo a marca e a navegação da estante.
- Persistidas em `localStorage` (`folio.reader.font-size`, `folio.reader.theme`), com valor desconhecido caindo no padrão; lidas no cliente após montar, para não divergir entre servidor e cliente.

### NT-4: Capítulo na URL

- Rota `/ebooks/[id]/ler`, com o capítulo no query param `?capitulo=3`.
- Sem o param (ou com valor inválido), a tela usa o capítulo do progresso salvo ou o 1.
- Trocar de capítulo atualiza a URL com `replace`, sem empilhar histórico a cada página virada.
