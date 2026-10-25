# Modo página

> Atualizado em 2026-10-25 — fontes: `packages/frontend/src/features/reader/**`, `specs/modo-pagina/spec.md` em `.sdd/changes/leitor-paginado/`

## O que é

A leitura página a página: o capítulo aparece em páginas medidas que ocupam a área da tela, a virada é horizontal e atravessa capítulos. É o modo único da tela desde esta feature — a coluna rolável foi removida e volta, virtualizada, na feature seguinte.

## Como funciona

- `ReaderScreen` (`components/reader-screen.tsx`) é a composição: recebe capítulo e progresso do `useReader`, páginas do `useReaderPage`, métricas da view e gestos do palco. Também decide o que aparece no fim do livro e na falha de trecho.
- `useReaderPage` (`use-reader-page.ts`) liga o motor ao capítulo: repassa altura e régua, guarda a direção da última virada, avisa a tela nas fronteiras do capítulo e reporta o offset do topo da página para o progresso.
- `ReaderPageView` (`components/reader-page-view.tsx`) desenha os parágrafos da página e mede a coluna com `ResizeObserver`, publicando `pageHeight` e a função `measure` para o motor.
- `ReaderPageInteraction` (`components/reader-page-interaction.tsx`) é o palco: resolve `pointerup` em swipe (≥ 60 px, horizontal), toque por faixa (25% esquerda volta, 50% centro abre o sumário, 25% direita avança) ou nada, ignorando texto selecionado; anima a página que entra.
- `page-gesture.ts` (`PageGesture`) concentra as regras puras de swipe e faixa, sem DOM.
- `useReaderKeyboard` virou página: setas, PageUp/PageDown e espaço (Shift+espaço volta); Escape fecha o sumário; troca de capítulo saiu do teclado.
- `ReaderToolbar` ganhou `pageLabel` opcional ("Página 3 de 17", contando só o trecho em memória).
- `ReaderFooterNotice` mostra a falha de trecho no rodapé, com "Tentar de novo", sem cobrir a página.

## Decisões e porquês

- **Zonas 25/50/25** — alvo grande para o polegar e o centro útil para o sumário, sem botão por cima do texto (o que quebraria a seleção).
- **Swipe com limiar e dominância** — arrasto curto devolve a página ao lugar; arrasto vertical não vira.
- **Toque e mouse no mesmo gesto** — o leitor de desktop testa o mesmo caminho do celular.
- **Só a página que entra anima (220 ms)** — a que sai é desmontada; simplificação consciente em relação ao "folhear" da spec.
- **Indicador conta o trecho, não o capítulo** — o capítulo nunca é materializado, então não há total de páginas do capítulo para prometer.
- **Abrir no fim só na virada para trás** — `landAtEndPosition` marca o capítulo anterior; qualquer navegação explícita (sumário, botões de capítulo) limpa a marca.
- **Progresso no offset do topo da página** — mantém o contrato capítulo + offset e faz a retomada cair na mesma página.
- **Capítulo só com metadados** — `useReader` passou a buscar `getChapterPage(..., limit 1)`; `getFullChapter` foi removida, para o app não ter atalho de materializar o capítulo.

## Notas

- `ReaderScreen` está com ~310 linhas; a divisão do corpo/rodapé ficou registrada como dívida.
- O code review da feature levantou 9 achados (1 grave, 5 médios, 3 menores): progresso gravado com offset do capítulo anterior na troca, "Reler desde o começo" inerte em livro de um capítulo, remontagem da medição a cada virada, área útil ≤ 0 sem estado de carregamento, fonte carregando depois da medição, botão direito virando página, animação reaparecendo em repaginação, Alt/Cmd+seta virando página e perda de foco/ausência de anúncio da página.
- Não há testes automatizados nesta mudança (config `tests: off`).
