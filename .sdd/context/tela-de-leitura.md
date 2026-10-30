---
# Tela de leitura

> Atualizado em 2026-10-22 · fontes: `packages/frontend/src/features/reader/**`, `src/app/ebooks/[id]/ler/page.tsx`, `features/shelf/components/book-card.tsx` e `book-detail-page.tsx`

## O que é

A rota `/ebooks/[id]/ler` permite ler o ebook capítulo a capítulo sobre o texto canônico do banco, com sumário, tipografia ajustável, teclado e retomada no ponto salvo. As entradas são a ficha do livro e o cartão da estante (só para livros `ready`).

## Como funciona

- `ReadingPage` (`app/ebooks/[id]/ler/page.tsx`) lê o id, o `?capitulo` (só dígitos, ≥ 1) e o `?offset` opcional (só dígitos, ≥ 0, usado por links de marcação) e monta `ReaderScreen` dentro de um `Suspense` (exigência do `useSearchParams`).
- `useReader` carrega sumário, progresso e capítulo (React Query) e resolve a abertura: navegação do usuário → `?capitulo` + `?offset` → `?capitulo` → progresso salvo → primeiro capítulo. O offset da URL vale só na primeira montagem, para voltar ao capítulo não puxar a leitura de novo para o destaque. Sincroniza o capítulo atual com a URL via `router.replace`.
- `useReaderPreferences` guarda fonte (16–24 px, padrão 18) e tema (`light`/`sepia`) em `localStorage`, lendo depois de montar para não divergir na hidratação.
- `useReadingProgressWriter` agenda o `PUT` com debounce de 2 s só quando a posição muda e descarrega ao trocar de capítulo, ocultar a aba (`visibilitychange`) e fechar a página (`pagehide` + `ReaderProgressBeacon`).
- `ReaderChapterView` é a área rolável: divide `chapter.text` por `\n\n`, guarda `data-offset` acumulado, restaura `resumeOffset` e reporta o offset do primeiro parágrafo visível.
- `ReaderToolbar` mostra título, "Capítulo X de Y", barra de posição e controles (anterior/próximo, sumário, A−/A+, tema). `ReaderTocDrawer` (só montado quando aberto) usa `useDialogPanel` da estante para foco/Esc.
- `useReaderKeyboard`: `←/→` trocam capítulo; `PageUp/PageDown/espaço` rolam o texto; `Escape` fecha o sumário. Não age com campo editável, sumário aberto (paginação) ou foco em botão/link.
- Estados de erro (`ReaderErrorMessage`): livro removido → estante; livro em preparo → retry/ficha; capítulo removido → primeiro capítulo/ficha; falha desconhecida (inclui falha do GET de progresso) → retry/ficha. Fim do livro oferece estante ou recomeço.
- `getFullChapter` pagina a API (`offset/limit`) e concatena o texto até `nextOffset` ser nulo — capítulos gigantes (PDF sem headings) chegam inteiros.

## Decisões e porquês

- **Capítulo por vez** — cada requisição vira uma tela; a navegação fica explícita e o progresso grava capítulo + offset sem medir páginas.
- **Retomada direta** — abrir no ponto salvo é o motivo de o progresso existir; não há diálogo extra.
- **Sumário em drawer** — preserva a largura da coluna e funciona igual no celular; reusa o diálogo acessível da estante.
- **Preferências no navegador** — são do leitor, não do livro; `localStorage` evita tocar no backend.
- **Capítulo na URL com `replace`** — recarregar mantém o capítulo sem empilhar histórico por página virada.
- **Gravação best-effort** — falha de `PUT` não interrompe a leitura; a posição fica em memória até a próxima mudança. No fechamento da aba, `sendBeacon`/`fetch keepalive` garantem a entrega.
- **Falha ao ler progresso é erro visível** — abrir no capítulo 1 e gravar por cima perderia o ponto salvo; por isso a tela oferece retry em vez de seguir.

## Notas

- O hook de teclado encontra o container do texto por `[aria-label="Texto do capítulo"]`; mudar esse rótulo desliga a rolagem por PageUp/PageDown (nada mais quebra).
- Ao abrir, a posição restaurada é reportada uma vez, então há um `PUT` redundante com o mesmo ponto (idempotente).
- Code review da feature: A1–A10 corrigidos (paginação do capítulo, gravação na troca/fechamento, fim do livro, teclado/sumário, erro do progresso, tema sépia e bordas de URL/offset).
- Dívida conhecida: `getFullChapter` busca as páginas em sequência (sem paralelismo); o histórico de posição é por livro, sem usuário; não há testes automatizados (config `tests: off`).
