# Modo rolagem

> Atualizado em 2026-10-28 — fontes: `packages/frontend/src/features/reader/**`

## O que é

A leitura com gesto de rolagem, mas **sem rolagem contínua**: a tela continua do tamanho de uma página e o texto não desliza num fluxo longo. Rolar (roda, trackpad ou arrasto vertical) puxa a página seguinte; a atual sai do DOM. O modo usa o **mesmo motor de páginas** do modo página, então só existe uma página de texto montada por vez.

## Como funciona

- `useReaderPage` fica habilitado nos dois modos. O motor busca o capítulo em janelas de 20 mil caracteres, pagina pela altura medida e entrega `page`, `pageIndex`, `direction`, `goToNextPage`/`goToPreviousPage`.
- `ReaderScrollPager` (`components/reader-scroll-pager.tsx`) é o gesto do modo rolagem: acumula `wheel` (com limiar e cooldown) e interpreta arrasto vertical de toque/ponteiro como próxima/anterior. Toque parado, toque longo e seleção de texto não viram página.
- `ReaderPageView` recebe `turnAxis="vertical"`: a página nova entra de baixo (próxima) ou de cima (anterior) com uma animação curta; a anterior já foi desmontada.
- Capítulo, progresso, citações, busca, chat e notas usam o mesmo caminho do modo página: o topo da página é o offset salvo; a virada além do fim/início do capítulo chama `onTurnPastEnd`/`onTurnPastStart`.
- `useReaderKeyboard` no modo rolagem manda PageDown/PageUp, setas verticais e espaço para a mesma virada de página.
- A barra mostra "Página X% do capítulo" também na rolagem, porque agora existe uma página concreta.

## Decisões e porquês

- **Uma página no DOM** — o modo anterior montava até três trechos de 20 mil caracteres (60 mil no DOM). Agora a tela carrega o mesmo tamanho de uma página, e o texto anterior desaparece de fato.
- **Sem barra de rolagem** — não há conteúdo contínuo para rolar; a rolagem é só o gesto que dispara a virada.
- **Mesmo motor dos dois modos** — alternar Página/Rolagem não recarrega o capítulo nem perde o ponto; muda apenas o gesto e o eixo da animação.
- **Limiar e cooldown na roda** — trackpads emitem deltas pequenos; acumular evita que um toque de dois dedos pule várias páginas.
- **Seleção manda** — se há texto selecionado, o gesto não vira página; o mesmo vale para toque longo (menu nativo).
- **Toque vertical sem `touch-action` nativo** — o palco usa `touch-action: pan-x` para o navegador não consumir o arrasto vertical como rolagem da página.

## Notas

- O motor de trechos contínuos (`useReaderScroll`, `ScrollSegments`, `ReaderScrollView`) foi removido; o `useReaderPage`/`useReaderWindow` agora atende os dois modos.
- Testado: roda para frente/trás, arrasto vertical, toque parado, toque longo, troca de capítulo nos dois sentidos, alternância de modo preservando a página e gravação de progresso.
- Sem testes automatizados (config `tests: off`).
