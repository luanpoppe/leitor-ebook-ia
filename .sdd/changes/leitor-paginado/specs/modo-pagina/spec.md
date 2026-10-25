# Spec: Modo página

> Parte de [`leitor-paginado`](../../plan.md)

## Resumo

A leitura passa a ser página a página, como num leitor de ebook: o texto ocupa a área da tela, a virada é horizontal e atravessa capítulos. Setas, swipe, zonas de toque e teclado viram a mesma página; saltar de capítulo continua sendo papel do sumário. A coluna rolável sai nesta feature e volta na seguinte como opção.

## Histórias do usuário

### HU-1: Virar página como num leitor de ebook

> **Como** leitor, **quero** virar a página com o gesto que já uso em qualquer leitor, **para** ler sem procurar botão.

#### CT-01: Virar pela zona de toque

- **Dado que** o leitor está na página 3 de um capítulo de `dom-casmurro.epub`
- **Quando** ele toca na faixa direita da tela
- **Então** a página 4 entra deslizando da direita
- **E** o texto começa exatamente onde a página 3 terminou

#### CT-02: Arrastar a página

- **Dado que** o leitor está na página 4
- **Quando** ele arrasta o dedo (ou o mouse) da direita para a esquerda
- **Então** a página 5 entra e a 4 sai para a esquerda
- **E** um arrasto curto devolve a página ao lugar, sem virar

#### CT-03: Virar pelo teclado

- **Dado que** o leitor está na página 5 com o foco na leitura
- **Quando** ele pressiona a seta para a direita, espaço ou PageDown
- **Então** a página 6 aparece
- **E** a seta para a esquerda, o Shift+espaço e o PageUp fazem o caminho de volta

### HU-2: Atravessar capítulos sem sair da leitura

> **Como** leitor, **quero** continuar virando páginas no fim do capítulo, **para** não abrir o sumário só para seguir lendo.

#### CT-04: Última página do capítulo

- **Dado que** o leitor está na última página do capítulo 2
- **Quando** ele vira para a próxima página
- **Então** a primeira página do capítulo 3 aparece
- **E** o título e o "Capítulo 3 de 12" da barra acompanham

#### CT-05: Primeira página do capítulo

- **Dado que** o leitor está na primeira página do capítulo 3
- **Quando** ele volta uma página
- **Então** a última página do capítulo 2 aparece
- **E** o progresso gravado passa a apontar para o capítulo 2

#### CT-06: Fim do livro

- **Dado que** o leitor está na última página do último capítulo
- **Quando** ele vira para a próxima página
- **Então** a mensagem "Fim do livro" aparece no lugar do texto
- **E** ele pode voltar à estante ou reler desde o começo

### HU-3: Não perder o ponto quando a tela muda

> **Como** leitor, **quero** que a página se ajuste à fonte e à tela sem me perder, **para** continuar do mesmo parágrafo.

#### CT-07: Aumentar a fonte

- **Dado que** o leitor está na página 2, com o parágrafo "Ao cabo de alguns minutos…" no topo
- **Quando** ele aumenta a fonte duas vezes
- **Então** o mesmo parágrafo continua no topo
- **E** o indicador passa a mostrar o novo total de páginas do trecho

### HU-4: Continuar na tela quando a rede falha

> **Como** leitor, **quero** que a falha ao buscar mais texto não apague o que estou lendo, **para** não perder a página por causa da conexão.

#### CT-08: Falha na virada

- **Dado que** o leitor está na última página do trecho em memória
- **Quando** ele vira a página e a busca falha
- **Então** a página atual continua na tela
- **E** um aviso no rodapé oferece "Tentar de novo"
- **E** ao tentar de novo com sucesso, a página seguinte aparece no lugar do aviso

## Edge cases

- Girar o aparelho → a leitura continua no mesmo parágrafo, com a nova altura e largura.
- Tela muito baixa (celular na horizontal) → a página mostra o que couber, nunca menos de uma linha.
- Sumário aberto → setas, zonas e swipe não viram página; Esc fecha o sumário.
- Vários toques seguidos na zona de avanço → uma única virada, sem buscar o mesmo trecho duas vezes.
- Livro de um capítulo só → atravessar não existe; no fim, a mensagem de fim do livro.
- Fonte mudada durante uma busca → a paginação nova chega ancorada no parágrafo que estava no topo.
- `prefers-reduced-motion` → a página troca sem animação, mas a virada continua.
- Texto selecionado com o mouse → o arrasto não vira página.

## Notas técnicas

### NT-1: Composição da tela

`ReaderScreen` troca `ReaderChapterView` por `ReaderPageView`. A tela mede a área útil (abaixo da barra) com `ResizeObserver` e passa `pageHeight`/`width` para `useReaderWindow`, mantendo `ReaderMeasureLayer` montado.

```json
{ "viewport": { "width": 1120, "height": 640 }, "pageHeight": 596, "fontSize": 18 }
```

- **Altura medida como 0** → a tela mostra o carregamento e repagina quando a medida chega.

### NT-2: Zonas e gesto

Faixas: 25% à esquerda volta, 50% centrais abrem o sumário, 25% à direita avança. O arrasto usa eventos de ponteiro: passa se o deslocamento horizontal for ≥ 60 px e maior que o vertical.

- **Arrasto abaixo do limiar** → a página volta ao lugar, sem virada nem busca.

### NT-3: Animação

A página que sai desloca 100% da largura em 220 ms e a que entra vem do lado oposto; a nova página já está montada durante a animação, então a leitura não espera.

- **`prefers-reduced-motion`** → troca instantânea, sem deslocamento.

### NT-4: Teclado

← / PageUp / Shift+espaço voltam; → / PageDown / espaço avançam. A troca de capítulo sai do teclado e fica só no sumário e nos botões da barra.

- **Campo editável, sumário aberto ou foco em botão** → o teclado não vira página.

### NT-5: Indicador

A barra mostra "Página 3 de 17": o total é o do trecho em memória, e a barra horizontal continua representando o progresso do capítulo.

```json
{ "pageIndex": 2, "pagesNoTrecho": 17, "rotulo": "Página 3 de 17" }
```

- **Trecho trocado** → o rótulo recomeça na página 1 do novo trecho, sem prometer um total do capítulo.

### NT-6: Progresso

Cada virada agenda a gravação com o offset do topo da página (`startOffset`); ao atravessar capítulo, grava o novo capítulo com o offset da página aberta.

- **Falha de gravação** → a leitura continua; o próximo movimento tenta de novo.

### NT-7: Falha ao buscar trecho

O aviso fica fixo no rodapé, com altura reservada para não cobrir texto, e traz "Tentar de novo"; o retry repete a virada pendente.

- **Retry bem-sucedido** → o aviso some e a página pendente aparece.
