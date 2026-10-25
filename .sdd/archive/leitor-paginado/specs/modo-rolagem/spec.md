# Spec: Modo rolagem

> Parte de [`leitor-paginado`](../../plan.md)

## Resumo

A leitura contínua: o capítulo desce em um fluxo só, sem páginas, atravessando para o próximo capítulo quando o texto acaba. Só os trechos ao redor do que está na tela ficam no DOM — o resto é descartado —, então um capítulo de centenas de milhares de caracteres rola sem travar. Página continua sendo o modo padrão; a escolha fica guardada no navegador.

## Histórias do usuário

### HU-1: Ler em fluxo contínuo

> **Como** leitor, **quero** descer o texto sem parar em páginas, **para** ler de forma corrida quando eu preferir.

#### CT-01: Rolar o capítulo

- **Dado que** o leitor escolheu o modo rolagem em `dom-casmurro.epub`
- **Quando** ele desliza o dedo (ou a roda do mouse) para baixo
- **Então** o texto continua descendo sem virada de página
- **E** o topo da tela mostra sempre o parágrafo seguinte ao que saiu

#### CT-02: Chegar ao fim do capítulo

- **Dado que** o leitor está no fim do capítulo 2
- **Quando** ele continua rolando
- **Então** o capítulo 3 é anexado logo abaixo
- **E** a leitura segue sem pausa visível nem salto de posição

#### CT-03: Voltar acima do começo do capítulo

- **Dado que** o leitor está na primeira tela do capítulo 3
- **Quando** ele rola para cima
- **Então** o fim do capítulo 2 aparece acima
- **E** o texto que estava na tela continua no mesmo lugar

### HU-2: Alternar os modos sem perder o ponto

> **Como** leitor, **quero** trocar entre página e rolagem no meio da leitura, **para** escolher o formato sem reler nem pular trecho.

#### CT-04: Trocar de modo no meio do capítulo

- **Dado que** o leitor está na página 3, com o parágrafo "Ao cabo de alguns minutos…" no topo
- **Quando** ele toca no botão de modo
- **Então** a leitura continua a partir do mesmo parágrafo
- **E** o texto anterior aparece acima, se houver espaço

#### CT-05: Reabrir o livro no mesmo modo

- **Dado que** o leitor deixou o livro em rolagem
- **Quando** ele volta ao livro depois de fechar o navegador
- **Então** a leitura abre em rolagem, no ponto salvo
- **E** a página continua sendo o modo de quem nunca trocou

### HU-3: Rolar um capítulo enorme sem travar

> **Como** leitor, **quero** rolar um capítulo gigante sem engasgo, **para** não perder a leitura por causa do tamanho do arquivo.

#### CT-06: Capítulo de 600 mil caracteres

- **Dado que** `relatorio.pdf` virou um único capítulo de 600 mil caracteres
- **Quando** o leitor desce do começo ao meio
- **Então** o texto rola de forma fluida
- **E** só os trechos ao redor do que está na tela ficam montados

#### CT-07: Rolar até longe do começo

- **Dado que** o leitor já desceu metade do capítulo
- **Quando** ele continua rolando mais alguns milhares de caracteres
- **Então** o começo do capítulo é descartado
- **E** a barra de rolagem não muda de tamanho nem a posição salta

### HU-4: Continuar lendo quando a rede falha

> **Como** leitor, **quero** que a falha ao buscar mais texto não apague o que já li, **para** continuar na tela e tentar de novo.

#### CT-08: Falha ao anexar o próximo trecho

- **Dado que** o leitor chegou à borda do texto carregado
- **Quando** a busca do trecho seguinte falha
- **Então** o que já está na tela continua legível
- **E** um aviso no fim do texto oferece "Tentar de novo"
- **E** ao tentar de novo com sucesso, o texto anexa e a leitura segue

## Edge cases

- Fim do último capítulo → a mensagem "Fim do livro" aparece ao pé do texto.
- Livro de um capítulo só → rolagem atravessa o capítulo inteiro e termina no fim do livro.
- Troca de modo durante uma busca → o modo novo abre no último offset conhecido e a busca antiga é descartada.
- Mudança de fonte ou tema na rolagem → a posição do parágrafo no topo é preservada; não há repaginação.
- Fonte que termina de carregar durante a rolagem → a posição é recalculada pelo offset, sem salto perceptível.
- Sumário aberto → a rolagem por trás não se move; Esc fecha o sumário.
- Redimensionar a janela → o parágrafo do topo continua no topo.

## Notas técnicas

### NT-1: Motor da rolagem

`useReaderScroll` usa o `WindowFetcher` e mantém uma lista ordenada de trechos em memória (no máximo três: anterior, atual, próximo), expondo parágrafos com offset absoluto e o estado de carga.

```json
{ "janelas": [{ "offset": 0 }, { "offset": 20000 }], "proximoOffset": 40000, "carregando": false }
```

- **Falha ao buscar** → a lista não muda, `erro` é preenchido e a rolagem continua no que já existe.

### NT-2: Virtualização por trecho

Só os trechos vizinhos ficam no DOM. Ao sair de vista, o trecho é substituído por um espaçador com a **altura medida** antes de sair, então a barra de rolagem e a posição não pulam.

```json
{ "removido": { "offset": 0, "altura": 4820 }, "espacador": 4820 }
```

- **Altura não medida** (trecho ainda não renderizado) → ele não é removido.

### NT-3: Anexar capítulo

Faltando menos de duas telas para o fim do trecho, o próximo é buscado. No fim do capítulo, usa-se `nextPosition` do capítulo atual e o primeiro trecho do capítulo seguinte é anexado; ao subir, o mesmo vale para `previousPosition`, com a posição visual mantida.

```json
{ "capitulo": 3, "proximo": 4, "offset": 0, "ancora": 19870 }
```

- **Sem próximo capítulo** → nada é anexado; o fim do livro aparece.

### NT-4: Progresso e modo

O progresso grava o offset do primeiro parágrafo visível, como hoje. A preferência de modo é `reader-mode` no `localStorage` (valores `page` e `scroll`, padrão `page`), lida depois de montar; ao trocar, o offset do topo é preservado e o outro modo abre nele.

```json
{ "modo": "scroll", "offsetTopo": 19870, "armazenado": "scroll" }
```

- **Sem preferência salva** → abre em página.

### NT-5: Teclado e gestos na rolagem

Espaço, PageDown e PageUp rolam uma tela; as setas rolam uma linha fracionada. A virada por swipe e por zona de toque fica desligada, assim como a animação de página.

- **Focus em botão, link ou campo editável** → o teclado não rola.
