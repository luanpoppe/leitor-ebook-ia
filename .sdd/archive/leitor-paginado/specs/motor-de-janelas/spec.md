# Spec: Motor de janelas

> Parte de [`leitor-paginado`](../../plan.md)

## Resumo

Busca o texto do capítulo em trechos e o transforma em páginas medidas, sem nunca materializar o capítulo inteiro. É a base dos modos página e rolagem: entrega páginas com offset exato, mantém uma reserva à frente e preserva o ponto de leitura quando a paginação muda.

## Histórias do usuário

### HU-1: Ler um livro grande sem travar

> **Como** leitor, **quero** abrir um capítulo enorme e começar a ler imediatamente, **para** não esperar o livro inteiro carregar.

#### CT-01: Abertura de um capítulo sem estrutura

- **Dado que** `relatorio.pdf` virou um único capítulo de 600 mil caracteres
- **Quando** o leitor abre a tela de leitura
- **Então** a primeira página aparece com o texto do início do capítulo
- **E** apenas o trecho necessário foi buscado

#### CT-02: Chegar ao fim do trecho carregado

- **Dado que** o leitor está na última página do trecho em memória
- **Quando** ele vira para a próxima página
- **Então** a página seguinte aparece com o texto que continua o capítulo
- **E** não há salto nem repetição de parágrafo

### HU-2: Não perder o ponto quando a leitura muda de forma

> **Como** leitor, **quero** ajustar a fonte ou girar o aparelho sem perder onde estava, **para** continuar do mesmo trecho.

#### CT-03: Mudança de fonte no meio do capítulo

- **Dado que** o leitor está na página 2, com o parágrafo "Ao cabo de alguns minutos…" no topo
- **Quando** ele aumenta a fonte duas vezes
- **Então** o mesmo parágrafo continua no topo da página
- **E** o indicador de páginas é recalculado

#### CT-04: Girar a tela

- **Dado que** o leitor está lendo no celular em pé
- **Quando** ele gira para a horizontal
- **Então** a leitura continua a partir do mesmo parágrafo
- **E** a página passa a usar a nova altura e largura

### HU-3: Continuar na tela quando a rede falha

> **Como** leitor, **quero** que uma falha ao buscar mais texto não apague o que já estou lendo, **para** não perder a página por causa da conexão.

#### CT-05: Falha ao buscar o próximo trecho

- **Dado que** o leitor está na última página do trecho em memória
- **Quando** a busca do trecho seguinte falha
- **Então** a página atual continua na tela
- **E** um aviso no rodapé oferece "Tentar de novo"
- **E** ao tentar de novo com sucesso, a próxima página aparece no lugar do aviso

### HU-4: Retomar exatamente onde parei

> **Como** leitor, **quero** que a página de abertura corresponda ao ponto salvo, **para** não reler nem pular trecho.

#### CT-06: Abertura no offset salvo

- **Dado que** o progresso está no capítulo 3, offset 1200
- **Quando** o leitor abre o livro
- **Então** a página exibida contém o caractere 1200
- **E** o texto anterior ao offset aparece acima, se houver espaço

## Edge cases

- Capítulo menor que um trecho → uma única busca, nenhuma pré-busca
- Offset além do texto (progresso em 1200, capítulo encolheu para 900 caracteres no reprocessamento) → primeira página do capítulo
- Duas viradas rápidas perto da fronteira → uma única busca do mesmo trecho
- Redimensionar durante uma busca → repaginar quando o texto chegar, mantendo a âncora
- Parágrafo maior que uma página → quebra entre páginas, sem espaço vazio
- Última página com pouco texto → página curta, sem esticar o conteúdo

## Notas técnicas

### NT-1: Contrato do trecho

O motor usa a rota existente de página de capítulo, de forma incremental: `GET /ebooks/:bookId/chapters/:position?offset&limit` (referência: `packages/frontend/src/features/reader/api.ts:getChapter`). Cada busca traz até **20.000 caracteres** e é identificada por `(bookId, position, offset)`.

```json
{
  "bookId": "01a15f7c-befb-7209-8426-70f0db3e070d",
  "position": 3,
  "offset": 1200,
  "limit": 20000
}
```

- **Falha de rede** → o trecho entra em estado `error` e a posição atual é preservada.
- **Resposta vazia** (`nextOffset` nulo e texto vazio) → fim do capítulo, sem novas buscas.

### NT-2: Modelo da página

- O motor mantém no máximo **três trechos**: anterior, atual e próximo. O anterior é o que permite voltar página sem nova busca.
- Pré-busca dispara quando falta **menos de 1,5 tela** para o fim do trecho atual.
- Cada página é `{ index, startOffset, endOffset }`, com os offsets contados a partir do início do capítulo.
- A paginação mede os parágrafos já renderizados e pode **cortar um parágrafo entre páginas**, garantindo que nenhuma linha fique escondida.
- A âncora de repaginação é `{ chapterPosition, offset }` do primeiro parágrafo visível; se esse offset não existir mais, cai no offset mais próximo anterior.

### NT-3: Quando a paginação é recalculada

- Mudança de fonte, de tema (só se alterar a largura útil), de orientação ou de tamanho da janela.
- A remediação é feita após a próxima renderização (fora do evento de resize), uma vez por frame.
- Enquanto a remediação não termina, a página antiga continua visível — não há tela de carregamento para repaginar.
- Buscas abaixo de 150 ms não mostram indicador de carregamento.
