# Modo rolagem

> Atualizado em 2026-10-28 — fontes: `packages/frontend/src/features/reader/**`

## O que é

A leitura contínua: o texto desce num fluxo só, sem páginas, atravessando para o capítulo seguinte quando acaba. A diferença para a versão anterior é o tamanho do que fica carregado: as janelas são de **4 mil caracteres** e a view troca os trechos fora da tela por espaçadores medidos. O DOM fica com cerca de **três trechos (~12 mil caracteres)**, não com os 60 mil de antes.

## Como funciona

- `useReaderScroll` (`use-reader-scroll.ts`) é o motor: guarda os trechos carregados em ordem, anexa e prepende atravessando capítulos, corta sobreposição, controla carga em voo/resposta obsoleta, guarda a falha e reporta o topo visível.
- A lista **não descarta trechos** ao anexar/prepender. Quem controla o tamanho do DOM é a view: um `IntersectionObserver` troca cada trecho fora de 150% da tela por um espaçador com a altura medida. Manter o trecho na lista evita o salto de rolagem que a remoção de um trecho acima da posição causava.
- `ScrollSegments` (`window/scroll-segments.ts`) divide a janela em parágrafos com offset absoluto em code points, calcula fim de trecho, corta o preposto e acha o capítulo vizinho.
- `ReaderScrollView` (`components/reader-scroll-view.tsx`) desenha os trechos, mede a altura antes de trocar por espaçador, pede mais texto a 1,5 tela do fim e 1 tela do começo, reporta o topo por frame, compensa prepend/descarte, reancora e mostra carga/erro/fim.
- `WindowFetcher` recebe o tamanho da janela; a rolagem usa `SCROLL_WINDOW_SIZE = 4.000` e `SCROLL_WINDOW_BACKTRACK = 1.000`. O modo página continua com `WINDOW_SIZE = 20.000`.
- `useReaderMode` + `reader-preferences.ts` guardam `reader-mode` (`page`/`scroll`, padrão `page`) no `localStorage`; `ReaderToolbar` mostra o modo de destino.
- `ReaderScreen` escolhe o renderizador, mantém `visiblePoint`/`pageOffset`/`scrollOffset`/`scrollAnchor` e faz barra, sumário e progresso seguirem o capítulo visível.
- `useReaderKeyboard` rola uma fração da tela no modo contínuo (PageDown/espaço/setas) e vira página no modo página.

## Decisões e porquês

- **Janelas de 4 mil em vez de 20 mil** — o texto total carregado e o DOM caem bastante; a carga seguinte chega antes de o leitor alcançar a borda.
- **Não descartar trechos na lista** — a remoção de um trecho acima da tela deslocava o conteúdo e fazia a leitura saltar. O espaçador da view mantém a altura e a posição.
- **Espaçador com a altura real** — evita a barra de rolagem mudar de tamanho e a posição pular; `overflow-anchor: none` impede compensação dupla do navegador.
- **Rolagem atravessa capítulos nos dois sentidos** — é o que faz a leitura ser contínua; a pré-busca começa antes da borda.
- **Preferência global, lida depois de montar** — evita divergência de hidratação, como fonte e tema.
- **Barra sem "Página X" na rolagem** — não há páginas nesse modo; fica só a barra de progresso do capítulo visível.
- **Abrir no fim só na virada para trás** — `landAtEndPosition` fica na navegação por página, não na rolagem.
- **Modo contínuo não bloqueia o modo página** — a tela mantém os dois estados para alternar sem recarregar.

## Notas

- O motor de rolagem anterior montava até três trechos de 20 mil (60 mil no DOM); agora a janela é 4 mil e a view virtualiza o que sai da tela.
- Testado: roda para frente/trás em passos pequenos, sem salto de posição; troca de capítulo nos dois sentidos; alternância de modo preservando o ponto; progresso gravado.
- Sem testes automatizados (config `tests: off`).
