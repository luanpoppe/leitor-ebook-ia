"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import Link from "next/link";
import { useEbookDetail } from "@/features/ebooks/use-ebook-detail";
import { useReader } from "../use-reader";
import { useReaderKeyboard } from "../use-reader-keyboard";
import { useReaderMode } from "../use-reader-mode";
import { useReaderPage, type ReaderPageMetrics } from "../use-reader-page";
import { useReaderPreferences } from "../use-reader-preferences";
import { useReaderScroll } from "../use-reader-scroll";
import { useReadingProgressWriter } from "../use-reading-progress-writer";
import { ReaderErrorMessage } from "./reader-error-message";
import { ReaderFooterNotice } from "./reader-footer-notice";
import { ReaderMessage } from "./reader-message";
import { ReaderPageInteraction } from "./reader-page-interaction";
import { ReaderPageView } from "./reader-page-view";
import {
  ReaderScrollView,
  type ReaderScrollViewHandle,
} from "./reader-scroll-view";
import { ReaderTocDrawer } from "./reader-toc-drawer";
import { ReaderChatDrawer } from "../chat/reader-chat-drawer";
import type { ChatCitation } from "../chat/types";
import { ReaderToolbar } from "./reader-toolbar";
import styles from "./reader-screen.module.css";
import messageStyles from "./reader-message.module.css";

const FIRST_CHAPTER_POSITION = 1;
const CHUNK_ERROR_MESSAGE = "Falha ao carregar o trecho do capítulo.";
// O carregamento cobre a área sem desmontar a view que a mede.
const PAGE_LOADING_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
};

interface ReaderScreenProps {
  bookId: string;
  initialChapterPosition: number | null;
}

// Ponto de leitura: capítulo + offset do primeiro parágrafo visível.
interface ReaderPoint {
  position: number;
  offset: number;
}

export function ReaderScreen({
  bookId,
  initialChapterPosition,
}: ReaderScreenProps): JSX.Element {
  const {
    chapters,
    chapter,
    currentPosition,
    errorKind,
    resumeOffset,
    savedProgress,
    hasPrevious,
    hasNext,
    goToChapter,
    goNext,
    goPrevious,
    retry,
  } = useReader(bookId, initialChapterPosition);
  const {
    fontSize,
    theme,
    canIncrease,
    canDecrease,
    increaseFont,
    decreaseFont,
    toggleTheme,
  } = useReaderPreferences();
  const { mode, toggleMode } = useReaderMode();
  const { scheduleSave } = useReadingProgressWriter(bookId, savedProgress);
  const { ebook } = useEbookDetail(bookId);

  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const [metrics, setMetrics] = useState<ReaderPageMetrics | null>(null);
  // Capítulo que abre na última página: voltar do começo do capítulo seguinte.
  const [landAtEndPosition, setLandAtEndPosition] = useState<number | null>(
    null
  );
  // Topo da leitura, comum aos dois modos: é o ponto que a troca de modo leva
  // de um para o outro e o que a barra mostra no modo rolagem.
  const [visiblePoint, setVisiblePoint] = useState<ReaderPoint>({
    position: currentPosition ?? FIRST_CHAPTER_POSITION,
    offset: resumeOffset,
  });
  // Offset de abertura do modo página. null = ainda seguindo o progresso salvo,
  // que só chega depois da montagem; navegar ou trocar de modo fixa o valor.
  const [pageOffset, setPageOffset] = useState<number | null>(null);
  // Espelho para a rolagem: fixado ao alternar de modo ou voltar de capítulo,
  // para o motor abrir na janela certa em vez do começo do capítulo.
  const [scrollOffset, setScrollOffset] = useState<number | null>(null);
  const [scrollAnchor, setScrollAnchor] = useState<ReaderPoint | null>(null);

  const scrollRef = useRef<ReaderScrollViewHandle>(null);
  const isScrollMode = mode === "scroll";

  // A view mede a área e publica a régua; uma identidade nova a cada render
  // dispararia repaginação em loop.
  const handleMetricsChange = useCallback((nextMetrics: ReaderPageMetrics) => {
    setMetrics(nextMetrics);
  }, []);

  const handlePageChange = useCallback(
    (position: number, offset: number) => {
      setVisiblePoint({ position, offset });
      scheduleSave(position, offset);
    },
    [scheduleSave]
  );

  const isLandingAtChapterEnd =
    chapter !== null && landAtEndPosition === chapter.position;
  const openingPageOffset = pageOffset ?? resumeOffset;
  const initialOffset = isLandingAtChapterEnd
    ? chapter.totalLength
    : openingPageOffset;

  const handleTurnPastEnd = useCallback(() => {
    if (!hasNext) {
      setHasReachedEnd(true);
      return;
    }

    setPageOffset(0);
    setLandAtEndPosition(null);
    goNext();
    setHasReachedEnd(false);
  }, [goNext, hasNext]);

  const handleTurnPastStart = useCallback(() => {
    const previousPosition = chapter?.previousPosition ?? null;
    if (!hasPrevious || previousPosition === null) return;

    setPageOffset(0);
    setLandAtEndPosition(previousPosition);
    goPrevious();
    setHasReachedEnd(false);
  }, [chapter, goPrevious, hasPrevious]);

  const {
    page,
    pageIndex,
    totalPages,
    direction,
    error: pageError,
    goToNextPage,
    goToPreviousPage,
    retry: retryPage,
    restart: restartChapter,
  } = useReaderPage({
    bookId,
    position: currentPosition ?? FIRST_CHAPTER_POSITION,
    initialOffset,
    metrics,
    enabled:
      !isScrollMode &&
      chapter !== null &&
      errorKind === null &&
      !hasReachedEnd,
    onTurnPastEnd: handleTurnPastEnd,
    onTurnPastStart: handleTurnPastStart,
    onPageChange: handlePageChange,
  });

  // Lista estável: uma array nova a cada render recriaria as cargas da rolagem.
  const chapterPositions = useMemo(
    () => chapters.map((chapterSummary) => chapterSummary.position),
    [chapters]
  );

  const handleScrollPositionChange = useCallback(
    (position: number, offset: number) => {
      setVisiblePoint({ position, offset });
      scheduleSave(position, offset);
    },
    [scheduleSave]
  );

  // O topo visível cruzou a fronteira: a URL e o capítulo da tela acompanham,
  // para a barra, o sumário e os botões de capítulo apontarem para ele.
  const handleScrollChapterChange = useCallback(
    (position: number) => {
      if (position === currentPosition) return;

      setLandAtEndPosition(null);
      goToChapter(position);
    },
    [currentPosition, goToChapter]
  );

  const {
    segments,
    isLoading: isScrollLoading,
    error: scrollError,
    errorDirection: scrollErrorDirection,
    hasReachedEnd: hasScrollReachedEnd,
    loadMore,
    loadPrevious,
    retry: retryScroll,
    reportVisible,
  } = useReaderScroll({
    bookId,
    position: currentPosition ?? FIRST_CHAPTER_POSITION,
    initialOffset: scrollOffset ?? resumeOffset,
    chapterPositions,
    // Sem capítulo resolvido ainda não se sabe onde abrir: buscar o primeiro
    // capítulo aqui faria a troca de modo piscar o texto errado. A rolagem
    // atravessa capítulos sem desligar.
    enabled: isScrollMode && currentPosition !== null,
    onChapterChange: handleScrollChapterChange,
    onPositionChange: handleScrollPositionChange,
  });

  const handleScrollVisible = useCallback(
    (position: number, offset: number) => {
      reportVisible(position, offset);
    },
    [reportVisible]
  );

  const firstChapterPosition =
    chapters[0]?.position ?? FIRST_CHAPTER_POSITION;

  // Pular capítulo pela barra é navegação explícita: não herda o "abrir no fim"
  // que só existe para a virada de página voltando do primeiro capítulo.
  const handleNextChapter = useCallback(() => {
    setPageOffset(0);
    setScrollOffset(0);
    setLandAtEndPosition(null);

    if (!hasNext) {
      setHasReachedEnd(true);
      return;
    }

    // Na rolagem o capítulo seguinte pode já estar anexado: quem leva a view
    // até ele é a âncora.
    const nextPosition = chapter?.nextPosition ?? null;
    const isScrollAnchorNeeded = isScrollMode && nextPosition !== null;
    if (isScrollAnchorNeeded) {
      setScrollAnchor({ position: nextPosition, offset: 0 });
    }

    goNext();
    setHasReachedEnd(false);
  }, [chapter, goNext, hasNext, isScrollMode]);

  const handlePreviousChapter = useCallback(() => {
    setPageOffset(0);
    setScrollOffset(0);
    setLandAtEndPosition(null);
    setHasReachedEnd(false);

    const previousPosition = chapter?.previousPosition ?? null;
    const isScrollAnchorNeeded = isScrollMode && previousPosition !== null;
    if (isScrollAnchorNeeded) {
      setScrollAnchor({ position: previousPosition, offset: 0 });
    }

    goPrevious();
  }, [chapter, goPrevious, isScrollMode]);

  const handleToggleToc = useCallback(() => {
    setIsChatOpen(false);
    setIsTocOpen((isOpen) => !isOpen);
  }, []);

  const handleCloseToc = useCallback(() => {
    setIsTocOpen(false);
  }, []);

  const handleToggleChat = useCallback(() => {
    setIsTocOpen(false);
    setIsChatOpen((isOpen) => !isOpen);
  }, []);

  const handleCloseChat = useCallback(() => {
    setIsChatOpen(false);
  }, []);

  // Citação do chat: fecha o painel e leva o leitor ao trecho citado.
  const handleCitationSelect = useCallback(
    (citation: ChatCitation) => {
      setIsChatOpen(false);
      setLandAtEndPosition(null);

      if (isScrollMode) {
        setScrollOffset(citation.offset);
        setScrollAnchor({
          position: citation.chapterPosition,
          offset: citation.offset,
        });
      } else {
        setPageOffset(citation.offset);
      }

      const isSameChapter = citation.chapterPosition === currentPosition;
      if (isSameChapter) return;

      goToChapter(citation.chapterPosition);
    },
    [currentPosition, goToChapter, isScrollMode]
  );

  const handleSelectChapter = useCallback(
    (position: number) => {
      setPageOffset(0);
      setScrollOffset(0);
      setLandAtEndPosition(null);
      setIsTocOpen(false);
      setHasReachedEnd(false);

      if (isScrollMode) {
        // O capítulo pode já estar anexado: a âncora leva a view ao começo.
        setScrollAnchor({ position, offset: 0 });
      }

      // Escolher o capítulo já aberto rebobina em vez de virar no-op.
      if (position === currentPosition) {
        if (isScrollMode) return;
        restartChapter();
        return;
      }

      goToChapter(position);
    },
    [currentPosition, goToChapter, isScrollMode, restartChapter]
  );

  const handleOpenFirstChapter = useCallback(() => {
    setPageOffset(0);
    setScrollOffset(0);
    setLandAtEndPosition(null);
    setHasReachedEnd(false);

    if (isScrollMode) {
      setScrollAnchor({ position: firstChapterPosition, offset: 0 });
    }

    // Livro de um capítulo só: o capítulo já é o primeiro, então recomeça nele.
    if (currentPosition === firstChapterPosition) {
      if (isScrollMode) return;
      restartChapter();
      return;
    }

    goToChapter(firstChapterPosition);
  }, [
    currentPosition,
    firstChapterPosition,
    goToChapter,
    isScrollMode,
    restartChapter,
  ]);

  const handleToggleMode = useCallback(() => {
    const isEnteringPageMode = isScrollMode;
    toggleMode();
    // "Abrir no fim" pertence à virada de página: trocar de modo não herda.
    setLandAtEndPosition(null);

    if (isEnteringPageMode) {
      const isVisibleChapterDifferent =
        visiblePoint.position !== currentPosition;
      if (isVisibleChapterDifferent) {
        goToChapter(visiblePoint.position);
      }

      // O offset do topo vale para o capítulo que vai abrir.
      setPageOffset(visiblePoint.offset);
      return;
    }

    // Entrar na rolagem não herda o fim do livro do modo página: quem sinaliza
    // o fim no fluxo contínuo é a própria view, no pé do texto.
    setHasReachedEnd(false);
    setScrollOffset(visiblePoint.offset);
    setScrollAnchor(visiblePoint);
  }, [currentPosition, goToChapter, isScrollMode, toggleMode, visiblePoint]);

  // Abrir direto em rolagem (preferência salva) não passa pelo botão de modo:
  // sem âncora a view mostraria o começo da janela e regravaria progresso menor.
  useEffect(() => {
    if (mode !== "scroll") return;
    if (scrollAnchor !== null) return;
    if (chapter === null) return;
    if (currentPosition === null) return;

    setScrollAnchor({ position: currentPosition, offset: resumeOffset });
  }, [chapter, currentPosition, mode, resumeOffset, scrollAnchor]);

  const handleScrollPage = useCallback(
    (direction: -1 | 1, fraction?: number) => {
      scrollRef.current?.scrollByPage(direction, fraction);
    },
    []
  );

  const readerTitle = ebook?.title ?? "Leitura";
  const backHref = `/ebooks/${bookId}`;
  const chaptersCount = chapters.length;
  const toolbarPosition = isScrollMode
    ? visiblePoint.position
    : currentPosition;
  const pageLabel =
    isScrollMode || page === null
      ? null
      : `Página ${pageIndex + 1} de ${totalPages}`;

  // Na rolagem o trecho visível conhece o total do capítulo; o capítulo da tela
  // é só o fallback enquanto a view ainda não reportou.
  const visibleScrollSegment = segments.find(
    (segment) => segment.position === visiblePoint.position
  );
  const scrollTotalLength =
    visibleScrollSegment?.totalLength ?? chapter?.totalLength ?? 0;
  const progressOffset = isScrollMode
    ? visiblePoint.offset
    : page?.startOffset ?? 0;
  const progressTotalLength = isScrollMode
    ? scrollTotalLength
    : chapter?.totalLength ?? 0;
  const chapterProgress = resolveChapterProgress(
    progressOffset,
    progressTotalLength
  );

  const isPageReadingBlocked =
    hasReachedEnd ||
    errorKind !== null ||
    pageError !== null ||
    chapter === null;
  // Falha de trecho na rolagem não trava o texto já carregado; só a ausência de
  // capítulo e o erro global impedem a leitura.
  const isScrollReadingBlocked = errorKind !== null || chapter === null;
  const isReadingBlocked = isScrollMode
    ? isScrollReadingBlocked
    : isPageReadingBlocked;
  const isReadingLocked = isReadingBlocked || isChatOpen;
  const isChunkErrorVisible =
    !isScrollMode && pageError !== null && errorKind === null && !hasReachedEnd;
  // Falha tem o aviso do rodapé; página nula sem falha é carga em andamento.
  const isPagePending =
    !isScrollMode && chapter !== null && page === null && pageError === null;

  useReaderKeyboard({
    mode,
    isTocOpen,
    isReadingBlocked: isReadingLocked,
    onCloseToc: handleCloseToc,
    onNext: goToNextPage,
    onPrevious: goToPreviousPage,
    onScrollPage: handleScrollPage,
  });

  const renderBody = () => {
    if (errorKind !== null) {
      return (
        <ReaderErrorMessage
          errorKind={errorKind}
          backHref={backHref}
          onRetry={retry}
          onOpenFirstChapter={handleOpenFirstChapter}
        />
      );
    }

    // A view desenha o próprio carregando, a falha com retry e o fim do livro.
    // Ao atravessar capítulos o metadado fica nulo por um instante: com trechos
    // em memória a view continua montada para a leitura não pular.
    if (isScrollMode) {
      const isScrollEmpty = segments.length === 0;
      if (chapter === null && isScrollEmpty) {
        return (
          <div className={styles.loading} aria-live="polite">
            <p className={styles.loadingText}>Carregando livro…</p>
          </div>
        );
      }

      return (
        <ReaderScrollView
          ref={scrollRef}
          segments={segments}
          isLoading={isScrollLoading}
          error={scrollError}
          errorDirection={scrollErrorDirection}
          hasReachedEnd={hasScrollReachedEnd}
          fontSize={fontSize}
          theme={theme}
          anchor={scrollAnchor}
          onLoadMore={loadMore}
          onLoadPrevious={loadPrevious}
          onRetry={retryScroll}
          onVisibleChange={handleScrollVisible}
        />
      );
    }

    // Sem capítulo e sem erro, ainda estamos abrindo o livro — inclusive se a
    // query ainda nem começou.
    if (chapter === null) {
      return (
        <div className={styles.loading} aria-live="polite">
          <p className={styles.loadingText}>Carregando livro…</p>
        </div>
      );
    }

    if (hasReachedEnd) {
      return (
        <ReaderMessage
          title="Fim do livro"
          description={`Você terminou ${readerTitle}.`}
          isEndOfBook
        >
          <Link href="/" className={messageStyles.secondaryAction}>
            Voltar à estante
          </Link>
          <button
            type="button"
            onClick={handleOpenFirstChapter}
            className={messageStyles.primaryAction}
          >
            Reler desde o começo
          </button>
        </ReaderMessage>
      );
    }

    return (
      <ReaderPageInteraction
        isBlocked={isReadingBlocked}
        onNext={goToNextPage}
        onPrevious={goToPreviousPage}
        onOpenToc={handleToggleToc}
      >
        <ReaderPageView
          page={page}
          pageKey={`${chapter.position}:${pageIndex}`}
          direction={direction}
          fontSize={fontSize}
          theme={theme}
          onMetricsChange={handleMetricsChange}
        />

        {isPagePending && (
          <div
            className={styles.loading}
            style={PAGE_LOADING_STYLE}
            aria-live="polite"
          >
            <p className={styles.loadingText}>Carregando página…</p>
          </div>
        )}
      </ReaderPageInteraction>
    );
  };

  return (
    <div className={styles.screen} data-theme={theme}>
      <ReaderToolbar
        bookTitle={readerTitle}
        backHref={backHref}
        currentPosition={toolbarPosition}
        chaptersCount={chaptersCount}
        pageLabel={pageLabel}
        chapterProgress={chapterProgress}
        isTocOpen={isTocOpen}
        onToggleToc={handleToggleToc}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onPrevious={handlePreviousChapter}
        onNext={handleNextChapter}
        fontSize={fontSize}
        canDecreaseFont={canDecrease}
        canIncreaseFont={canIncrease}
        onDecreaseFont={decreaseFont}
        onIncreaseFont={increaseFont}
        theme={theme}
        onToggleTheme={toggleTheme}
        mode={mode}
        onToggleMode={handleToggleMode}
        isChatOpen={isChatOpen}
        onToggleChat={handleToggleChat}
      />

      <main className={styles.main}>
        {renderBody()}

        {isChunkErrorVisible && (
          <ReaderFooterNotice
            message={CHUNK_ERROR_MESSAGE}
            onRetry={retryPage}
          />
        )}
      </main>

      {isTocOpen && (
        <ReaderTocDrawer
          chapters={chapters}
          currentPosition={toolbarPosition}
          onSelect={handleSelectChapter}
          onClose={handleCloseToc}
        />
      )}

      {isChatOpen && (
        <ReaderChatDrawer
          bookId={bookId}
          position={
            isScrollMode
              ? visiblePoint.position
              : toolbarPosition ?? FIRST_CHAPTER_POSITION
          }
          offset={isScrollMode ? visiblePoint.offset : page?.startOffset ?? 0}
          onClose={handleCloseChat}
          onCitationSelect={handleCitationSelect}
        />
      )}
    </div>
  );
}

function resolveChapterProgress(offset: number, totalLength: number): number {
  if (totalLength <= 0) return 0;

  const ratio = offset / totalLength;
  const lowerBoundedRatio = Math.max(ratio, 0);
  return Math.min(lowerBoundedRatio, 1);
}
