import type { ExtractedChapter } from '../extraction/content.types';

const TARGET_CHUNK_LENGTH = 1000;
const OVERLAP_LENGTH = 150;
const HARD_MAX_CHUNK_LENGTH = 2000;

const PARAGRAPH_SEPARATOR = '\n\n';
const SENTENCE_SEPARATOR = ' ';
const PARAGRAPH_BREAK_PATTERN = /\n{2,}/;
const SENTENCE_BREAK_PATTERN = /(?<=[.!?])\s+/u;

/**
 * Teto de cada fragmento. Já reserva o overlap e o separador que o trecho novo
 * vai receber, então o contexto repetido não empurra o trecho acima do alvo.
 */
const MAX_FRAGMENT_LENGTH =
  TARGET_CHUNK_LENGTH - OVERLAP_LENGTH - PARAGRAPH_SEPARATOR.length;

export interface ChunkDraft {
  position: number;
  text: string;
}

export interface ChapterChunks {
  chapterPosition: number;
  chunks: ChunkDraft[];
}

export class TextChunker {
  static chunkChapter(text: string): ChunkDraft[] {
    const normalizedText = text.replace(/\r\n?/g, '\n');
    const paragraphs = TextChunker.toParagraphs(normalizedText);
    if (paragraphs.length === 0) return [];

    const fragments = TextChunker.toFragments(paragraphs);
    const chunkTexts = TextChunker.mergeFragments(fragments);

    return chunkTexts.map((chunkText, index) => ({
      position: index + 1,
      text: chunkText,
    }));
  }

  static chunkChapters(chapters: ExtractedChapter[]): ChapterChunks[] {
    return chapters
      .map((chapter) => ({
        chapterPosition: chapter.position,
        chunks: TextChunker.chunkChapter(chapter.text),
      }))
      .filter((chapterChunks) => chapterChunks.chunks.length > 0);
  }

  private static toParagraphs(text: string): string[] {
    return text
      .split(PARAGRAPH_BREAK_PATTERN)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);
  }

  private static toFragments(paragraphs: string[]): string[] {
    const fragments: string[] = [];

    for (const paragraph of paragraphs) {
      const fitsInFragment = paragraph.length <= MAX_FRAGMENT_LENGTH;
      if (fitsInFragment) {
        fragments.push(paragraph);
        continue;
      }

      const paragraphFragments = TextChunker.splitLongParagraph(paragraph);
      fragments.push(...paragraphFragments);
    }

    return fragments;
  }

  /**
   * Quebra um parágrafo grande preferindo fim de frase. Cada frase é fatiada
   * na janela do fragmento, então o limite rígido só entra quando não existe
   * espaço nenhum para cortar sem partir uma palavra.
   */
  private static splitLongParagraph(paragraph: string): string[] {
    const sentences = paragraph.split(SENTENCE_BREAK_PATTERN);
    const fragments: string[] = [];
    let currentFragment = '';

    for (const sentence of sentences) {
      const sentencePieces = TextChunker.splitOversizedText(sentence);

      for (const piece of sentencePieces) {
        const isCurrentEmpty = currentFragment.length === 0;
        const candidateLength = isCurrentEmpty
          ? piece.length
          : currentFragment.length + SENTENCE_SEPARATOR.length + piece.length;
        const overflowsFragment =
          !isCurrentEmpty && candidateLength > MAX_FRAGMENT_LENGTH;

        if (overflowsFragment) {
          fragments.push(currentFragment);
          currentFragment = piece;
          continue;
        }

        currentFragment = isCurrentEmpty
          ? piece
          : `${currentFragment}${SENTENCE_SEPARATOR}${piece}`;
      }
    }

    if (currentFragment.length > 0) fragments.push(currentFragment);

    return fragments;
  }

  private static splitOversizedText(text: string): string[] {
    const fitsInFragment = text.length <= MAX_FRAGMENT_LENGTH;
    if (fitsInFragment) return [text];

    const pieces: string[] = [];
    let remainingText = text;

    while (remainingText.length > MAX_FRAGMENT_LENGTH) {
      const cutIndex = TextChunker.findCutIndex(remainingText);

      pieces.push(remainingText.slice(0, cutIndex).trimEnd());
      remainingText = remainingText.slice(cutIndex).trimStart();
    }

    if (remainingText.length > 0) pieces.push(remainingText);

    return pieces;
  }

  /**
   * Corta preferindo a janela do alvo; sem espaço nela, tenta a janela do
   * limite rígido; sem nenhum espaço, aí sim corta o texto no limite rígido.
   */
  private static findCutIndex(text: string): number {
    const targetWindow = text.slice(0, MAX_FRAGMENT_LENGTH);
    const targetSpaceIndex = targetWindow.lastIndexOf(' ');
    if (targetSpaceIndex > 0) return targetSpaceIndex;

    const hardMaxWindow = text.slice(0, HARD_MAX_CHUNK_LENGTH);
    const hardMaxSpaceIndex = hardMaxWindow.lastIndexOf(' ');
    if (hardMaxSpaceIndex > 0) return hardMaxSpaceIndex;

    return HARD_MAX_CHUNK_LENGTH;
  }

  /**
   * Junta fragmentos até o alvo e repete o fim do anterior no trecho seguinte.
   * Como o fragmento já cabe junto com o overlap, o trecho nunca passa do alvo
   * por causa do contexto repetido.
   */
  private static mergeFragments(fragments: string[]): string[] {
    const chunkTexts: string[] = [];
    let currentChunk = '';

    for (const fragment of fragments) {
      const appendedChunk = TextChunker.appendFragment(currentChunk, fragment);
      const fitsInCurrentChunk = appendedChunk.length <= TARGET_CHUNK_LENGTH;

      if (fitsInCurrentChunk) {
        currentChunk = appendedChunk;
        continue;
      }

      const hasCurrentContent = currentChunk.length > 0;
      if (hasCurrentContent) chunkTexts.push(currentChunk);

      currentChunk = TextChunker.openNextChunk(currentChunk, fragment);
    }

    const hasCurrentContent = currentChunk.length > 0;
    if (hasCurrentContent) chunkTexts.push(currentChunk);

    return chunkTexts;
  }

  private static appendFragment(currentChunk: string, fragment: string): string {
    const isCurrentEmpty = currentChunk.length === 0;
    if (isCurrentEmpty) return fragment;

    return `${currentChunk}${PARAGRAPH_SEPARATOR}${fragment}`;
  }

  /**
   * Abre o trecho seguinte com o overlap do anterior. Fragmento maior que a
   * folga (só acontece no fallback sem espaço) abre o trecho sem overlap.
   */
  private static openNextChunk(previousChunk: string, fragment: string): string {
    const overlap = TextChunker.takeOverlap(previousChunk);
    const hasOverlap = overlap.length > 0;
    if (!hasOverlap) return fragment;

    const chunkWithOverlap = `${overlap}${PARAGRAPH_SEPARATOR}${fragment}`;
    const fitsInTarget = chunkWithOverlap.length <= TARGET_CHUNK_LENGTH;
    if (!fitsInTarget) return fragment;

    return chunkWithOverlap;
  }

  /**
   * Repete o fim do trecho anterior no começo do próximo. O corte começa no
   * primeiro espaço da cauda para não abrir o trecho no meio de uma palavra;
   * cauda sem espaço nenhum fica sem overlap pelo mesmo motivo.
   */
  private static takeOverlap(previousChunk: string): string {
    const hasPreviousContent = previousChunk.length > 0;
    if (!hasPreviousContent) return '';

    const tailStart = Math.max(0, previousChunk.length - OVERLAP_LENGTH);
    const tail = previousChunk.slice(tailStart);
    const firstSpaceIndex = tail.search(/\s/);
    if (firstSpaceIndex < 0) return '';

    const overlap = tail.slice(firstSpaceIndex + 1);
    const repeatsWholeChunk = overlap.length >= previousChunk.length;
    if (repeatsWholeChunk) return '';

    return overlap;
  }
}
