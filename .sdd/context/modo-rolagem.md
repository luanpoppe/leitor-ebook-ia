# Modo rolagem

> Atualizado em 2026-10-25 — fontes: `packages/frontend/src/features/reader/**`, `specs/modo-rolagem/spec.md` em `.sdd/changes/leitor-paginado/`

## O que é

A leitura contínua: o capítulo desce num fluxo só, sem páginas, atravessando para o capítulo seguinte quando o texto acaba. Só os trechos ao redor do que está na tela ficam no DOM. Página continua sendo o modo padrão; a escolha fica no navegador e o botão da barra alterna.

## Como funciona

- `useReaderScroll` (`use-reader-scroll.ts`) é o motor: mantém até três trechos (anterior, atual e próximo), anexa e prepende atravessando capítulos, corta sobreposição, controla carga em voo e resposta obsoleta, guarda a falha e a direção dela para o retry e reporta o topo visível.
- `ScrollSegments` (`window/scroll-segments.ts`) concentra a matemática: divide a janela em parágrafos com offset absoluto em code points, calcula fim de trecho, corta o preposto e acha o capítulo vizinho na lista do sumário.
- `ReaderScrollView` (`components/reader-scroll-view.tsx`) desenha os trechos, troca por espaçador com a altura medida ao sair de 150% da margem, pede mais texto a 1,5 tela do fim e 1 tela do começo, reporta o topo por frame, compensa prepend/descarte, reancora e mostra carga/erro/fim.
- `useReaderMode` + `reader-preferences.ts` guardam `reader-mode` (`page`/`scroll`, padrão `page`) no `localStorage`; `ReaderToolbar` ganhou o botão que mostra o modo de destino.
- `ReaderScreen` escolhe o renderizador pelo modo, mantém `visiblePoint`/`pageOffset`/`scrollOffset`/`scrollAnchor` e faz barra, sumário e progresso seguirem o capítulo visível.
- `useReaderKeyboard` rola no modo contínuo (PageDown/espaço/setas) e vira página no modo página.

## Decisões e porquês

- **Virtualização por espaçador com altura medida** — reservar espaço com a altura real evita a barra de rolagem mudar de tamanho e a posição saltar; `overflow-anchor: none` impede compensação dupla do navegador.
- **Rolagem atravessa capítulos nos dois sentidos** — é o que faz a leitura ser contínua; a pré-busca começa duas telas antes da borda.
- **Preferência global, lida depois de montar** — evita divergência de hidratação, como fonte e tema.
- **Barra sem "Página X de Y" na rolagem** — não há páginas nesse modo; fica só a barra de progresso do capítulo visível.
- **Abrir no fim só na virada para trás** — `landAtEndPosition` continua sendo da navegação por página, não da rolagem.
- **Modo contínuo não bloqueia o modo página** — `useReaderPage` fica habilitado só no modo página, mas a tela mantém os dois estados para alternar sem recarregar.

## Notas

- `reader-screen.tsx` chegou a ~568 linhas; a divisão (composição de modo vs. corpo) está registrada como dívida.
- O code review da feature levantou 14 achados; os 14 foram corrigidos no chunk de correção `F3.C4`: compensação de scroll por âncora de trecho, abertura em rolagem ancorada no progresso, `scrollOffset` zerado nas setas de capítulo, `landAtEndPosition` limpo na troca de modo, fronteira de parágrafo tratada por `lastChar`, reancoragem em resize de largura e carga de fonte, cargas para cima liberadas no fim do livro, setas rolando uma fração, aviso de falha no lado certo, `flow-root` no segmento, anúncio da travessia de capítulo, varredura restrita ao trecho visível, remontagem de fonte adiada para um frame e limite alinhado em três trechos.
- Não há testes automatizados nesta mudança (config `tests: off`).
