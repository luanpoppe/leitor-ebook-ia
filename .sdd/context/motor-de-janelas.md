# Motor de janelas

> Atualizado em 2026-10-25 — fontes: `packages/frontend/src/features/reader/window/**`, `packages/frontend/src/features/reader/use-reader-window.ts`, `packages/frontend/src/features/reader/components/reader-measure-layer.*`, `specs/motor-de-janelas/spec.md` em `.sdd/changes/leitor-paginado/`

## O que é

A base da leitura paginada: busca o texto do capítulo em trechos de até 20 mil caracteres, transforma cada trecho em páginas de altura medida e mantém o ponto de leitura quando a tipografia muda. Não materializa o capítulo inteiro e ainda não está ligado à tela — quem consome é a feature seguinte (modo página).

## Como funciona

- `window-types.ts` define `WINDOW_SIZE` (20.000), `TextWindow` (position, offset, text, nextOffset, totalLength) e a chave `position:offset`.
- `window-fetcher.ts` (`WindowFetcher`) é a memória de trechos da sessão: no máximo 3 janelas em RAM, descarte LRU, `get` deduplica requisição em voo, `peek` só lê o cache e `prefetch` busca sem bloquear e engole a falha.
- `page-paginator.ts` (`PagePaginator`) corta um trecho em páginas por altura medida: salto exponencial + busca binária para achar o maior pedaço que cabe, corte em fronteira de code point e `findPageIndex`/`resolveStartOffset` para achar a página de um offset.
- `window-pager.ts` (`WindowPager`) aplica a paginação ao trecho, resolve a página de aterrissagem (primeira, última ou offset) e reancora depois de repaginar (fallback para a última página que começa antes da âncora).
- `window-trail.ts` (`WindowTrail`) guarda o rastro dos trechos visitados; avançar descarta o futuro e voltar reaproveita o ponto anterior, estimando uma janela antes quando ele nunca foi visitado.
- `use-reader-window.ts` (`useReaderWindow`) orquestra: carrega o trecho do capítulo no offset de retomada, pagina, vira página dentro e entre trechos, repagina pela âncora quando `pageHeight`/`measure` mudam e guarda ponto + destino da falha para o retry.
- `reader-measure-layer.tsx` é a régua invisível: um bloco fora do fluxo, com a tipografia real, que publica `measure(texto) → altura` por ref; a tela de leitura memoiza essa função e injeta no hook.

## Decisões e porquês

- **Trechos, nunca o capítulo inteiro** — capítulos sem estrutura chegam a centenas de milhares de caracteres; carregar tudo trava a tela. A API existente já pagina por `offset`/`limit`.
- **Memória de janelas é RAM da sessão** — não é cache de aplicação nem substitui o React Query (que segue guardando sumário, progresso e capítulo). Só 3 trechos ficam vivos.
- **Página por medição real** — só o navegador sabe onde a linha quebra com a fonte e a largura atuais; medir por estimativa faria a página vazar do viewport.
- **Âncora por offset com fallback** — ao mudar fonte ou girar a tela, o topo da página é reencontrado pelo offset; se ele sumiu, recua em vez de pular adiante.
- **Preferência por uma pré-busca só** — o trecho seguinte é buscado quando restam menos de duas páginas à frente (aproximação de 1,5 tela), para a virada não esperar a rede.
- **Falha não apaga a leitura** — a página atual continua na tela, o erro fica exposto e o retry repete a mesma virada.
- **Camada de medição separada do hook** — o hook recebe `measure` por injeção, o que mantém a orquestração testável sem DOM e deixa a tipografia na tela.

## Notas

- `measure` precisa ser memoizado pelo consumidor; a camada publica uma função estável justamente por isso.
- A camada de medição replica a divisão de parágrafos por `\n\n` e a margem de 1,25em de `reader-chapter-view.module.css`; mudar a tipografia da página exige acompanhar o CSS da camada.
- Offsets de página são calculados em unidades UTF-16 do JavaScript, enquanto o backend conta code points (`char_length`) — divergência conhecida, inofensiva dentro da sessão, mas perigosa na gravação de progresso em capítulos com emoji.
- O code review da feature levantou 8 achados (1 grave, 5 médios, 2 menores) sobre voltar do primeiro trecho estimado, rastro duplicado em viradas rápidas, retomada sem o texto anterior ao offset, medida degenerada (0/NaN), custo de remedir o sufixo, erro que não limpa ao navegar, offsets UTF-16 e religar `enabled`.
- Não há testes automatizados nesta mudança (config `tests: off`).
