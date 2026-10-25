---
# Leitura paginada

> **id**: `leitor-paginado` · **criada**: 2026-10-22 · **idioma**: pt-BR

## Contexto

A tela de leitura entrega o capítulo inteiro numa coluna rolável: o texto é materializado de uma vez e não há navegação horizontal. Esta mudança troca o renderizador por um leitor em **janelas** — o texto é buscado por offset e só o trecho ao redor da posição atual existe no DOM — e entrega dois modos: **página** (padrão, virada horizontal tipo Kindle) e **rolagem** (contínua e virtualizada).

## Decisões macro

- **Nunca materializar o capítulo inteiro**: o texto vem da API existente em trechos (`offset`/`limit`) e o DOM mantém apenas a janela atual e a seguinte. **Por quê**: capítulos sem estrutura chegam a centenas de milhares de caracteres; renderizar tudo trava a tela e contraria a experiência de leitor. **Alternativa descartada**: continuar carregando o capítulo completo e só esconder o excedente via CSS.
- **Memória de janelas é RAM da sessão, não cache de aplicação**: o motor guarda no máximo três trechos do texto (anterior, atual e próximo), indexados por posição + offset, para voltar página sem nova requisição; nada é persistido e nada substitui o React Query (que continua guardando sumário, progresso e capítulo inteiro). **Por quê**: sem essa distinção, "cache" sugere uma camada global que o produto não tem.
- **Paginação medida por parágrafo**: os parágrafos são medidos no DOM e agrupados em páginas conforme fonte e viewport; cada página conhece o offset de caractere do seu primeiro parágrafo. **Por quê**: retomada e progresso continuam exatos e a repaginação por fonte/tela preserva o trecho. **Alternativa descartada**: colunas CSS com deslocamento horizontal, que dariam offset aproximado.
- **Página é o padrão, rolagem é opção**: o modo é uma preferência persistida no navegador, ao lado de fonte e tema. **Por quê**: a leitura página-a-página é o comportamento desejado; a rolagem fica para quem prefere fluxo contínuo.
- **Navegação horizontal anda páginas**: setas, swipe e zonas de toque viram página e atravessam para o capítulo seguinte no fim (e para o anterior no início). **Por quê**: é o gesto de leitor; saltar capítulo continua sendo papel do sumário.
- **Reúso da base atual**: permanecem `useReader`, `useReadingProgressWriter`, `useReaderPreferences`, `ReaderToolbar`, `ReaderTocDrawer` e os estados de erro/fim do livro. **Por quê**: o que muda é como o texto é apresentado, não de onde ele vem.
- **Progresso continua capítulo + offset**: o contrato do backend não muda; a página apenas calcula qual offset representar. **Por quê**: o histórico já gravado segue válido e a mudança não exige migração.

## Features (executadas sequencialmente)

1. **motor-de-janelas** — busca trechos por offset e produz páginas medidas com offset exato, mantendo só a janela atual e pré-buscando a seguinte.
2. **modo-pagina** — virada horizontal com animação, swipe, zonas de toque e teclado, atravessando capítulos e retomando por offset.
3. **modo-rolagem** — rolagem contínua virtualizada que anexa e descarta trechos, com preferência de modo persistida (padrão página).

## Escopo

**Dentro**:
- Janelas de texto com busca incremental e descarte do que saiu de vista.
- Modo página como padrão, com página definida por fonte + viewport.
- Swipe, zonas de toque, teclado e animação de virada.
- Travessia automática entre capítulos e retomada por offset.
- Modo rolagem virtualizado e seletor de modo persistido.
- Repaginação ao mudar fonte, tema, orientação ou tamanho de tela.

**Fora**:
- Formatação rica, imagens e layout fiel ao original.
- Duas páginas lado a lado em paisagem e efeito de folhear.
- Grifos, anotações, marcadores e busca dentro do livro.
- Pré-carregar o livro inteiro ou sincronizar posição entre dispositivos.
- Mudanças no contrato do backend (a API atual já pagina por offset).
