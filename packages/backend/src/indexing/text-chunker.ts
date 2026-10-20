import type { ExtractedChapter } from '../extraction/content.types';

const TARGET_CHUNK_LENGTH = 1000;
const OVERLAP_LENGTH = 150;
const HARD_MAX_CHUNK_LENGTH = 2000;

const PARAGRAPH_SEPARATOR = '\n\n';
const SENTENCE_SEPARATOR = ' ';
const PARAGRAPH_BREAK_PATTERN = /\n{2,}/;
const SENTENCE_BREAK_PATTERN = /(?<=[.!?])\s+/u;

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
      const isWithinTarget = paragraph.length <= TARGET_CHUNK_LENGTH;
      if (isWithinTarget) {
        fragments.push(paragraph);
        continue;
      }

      const paragraphFragments = TextChunker.splitLongParagraph(paragraph);
      fragments.push(...paragraphFragments);
    }

    return fragments;
  }

  /**
   * Quebra um parágrafo grande preferindo fim de frase. Uma frase que sozinha
   * passa do limite rígido é cortada no último espaço antes dele.
   */
  private static splitLongParagraph(paragraph: string): string[] {
    const sentences = paragraph.split(SENTENCE_BREAK_PATTERN);
    const fragments: string[] = [];
    let currentFragment = '';

    for (const sentence of sentences) {
      const sentencePieces = TextChunker.limitSentenceLength(sentence);

      for (const piece of sentencePieces) {
        const isCurrentEmpty = currentFragment.length === 0;
        const candidateLength = isCurrentEmpty
          ? piece.length
          : currentFragment.length + SENTENCE_SEPARATOR.length + piece.length;
        const overflowsTarget =
          !isCurrentEmpty && candidateLength > TARGET_CHUNK_LENGTH;

        if (overflowsTarget) {
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

  private static limitSentenceLength(sentence: string): string[] {
    const isWithinHardMax = sentence.length <= HARD_MAX_CHUNK_LENGTH;
    if (isWithinHardMax) return [sentence];

    const pieces: string[] = [];
    let remainingText = sentence;

    while (remainingText.length > HARD_MAX_CHUNK_LENGTH) {
      const window = remainingText.slice(0, HARD_MAX_CHUNK_LENGTH);
      const lastSpaceIndex = window.lastIndexOf(' ');
      const cutIndex =
        lastSpaceIndex > 0 ? lastSpaceIndex : HARD_MAX_CHUNK_LENGTH;

      pieces.push(remainingText.slice(0, cutIndex));
      remainingText = remainingText.slice(cutIndex).trimStart();
    }

    if (remainingText.length > 0) pieces.push(remainingText);

    return pieces;
  }

  private static mergeFragments(fragments: string[]): string[] {
    const chunkTexts: string[] = [];
    let currentChunk = '';

    for (const fragment of fragments) {
      if (currentChunk.length === 0) {
        currentChunk = fragment;
        continue;
      }

      const candidateLength =
        currentChunk.length + PARAGRAPH_SEPARATOR.length + fragment.length;
      const fitsInCurrentChunk = candidateLength <= TARGET_CHUNK_LENGTH;

      if (fitsInCurrentChunk) {
        currentChunk = `${currentChunk}${PARAGRAPH_SEPARATOR}${fragment}`;
        continue;
      }

      chunkTexts.push(currentChunk);
      currentChunk = TextChunker.startChunkFrom(currentChunk, fragment);
    }

    if (currentChunk.length > 0) chunkTexts.push(currentChunk);

    return chunkTexts;
  }

  private static startChunkFrom(
    previousChunk: string,
    fragment: string,
  ): string {
    const overlap = TextChunker.takeOverlap(previousChunk, fragment.length);
    if (overlap.length === 0) return fragment;

    return `${overlap}${PARAGRAPH_SEPARATOR}${fragment}`;
  }

  /**
   * Repete o fim do trecho anterior no começo do próximo. O corte começa no
   * primeiro espaço da cauda para não abrir o trecho no meio de uma palavra.
   */
  private static takeOverlap(previousChunk: string, nextLength: number): string {
    // Um fragmento que já encosta no alvo não ganha overlap: passaria do alvo
    // sem necessidade e, se vier de corte rígido, estouraria o limite máximo.
    const canCarryOverlap = nextLength < TARGET_CHUNK_LENGTH;
    if (!canCarryOverlap) return '';

    const tailStart = Math.max(0, previousChunk.length - OVERLAP_LENGTH);
    const tail = previousChunk.slice(tailStart);
    const firstSpaceIndex = tail.search(/\s/);
    const overlap =
      firstSpaceIndex >= 0 ? tail.slice(firstSpaceIndex + 1) : tail;

    const repeatsWholeChunk = overlap.length >= previousChunk.length;
    if (repeatsWholeChunk) return '';

    return overlap;
  }
}
