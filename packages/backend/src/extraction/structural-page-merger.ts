import type { ExtractedChapter } from './content.types';

// Páginas de abertura (parte, capítulo, título) são curtas; um capítulo real
// com conteúdo não deve entrar aqui.
const MAX_STRUCTURAL_CHARS = 350;
// A página estrutural só é absorvida por um capítulo com conteúdo de verdade.
const MIN_NEXT_CONTENT_CHARS = 1_000;
// Página de nota/footnote curta que pode ficar entre a abertura e o conteúdo.
const MAX_NOTE_PAGE_CHARS = 600;
const MAX_TITLE_LENGTH = 200;

// "PARTE I", "Parte 2", "LIVRO", "BOOK", "ATO", "SEÇÃO"...
const PART_PATTERN =
  /^(parte|part|livro|book|ato|act|se[cç][aã]o|section)\b/iu;
// Matéria de abertura/fechamento que não deve virar prefixo de capítulo.
const NON_STRUCTURAL_TITLE_PATTERN =
  /^(cr[eé]ditos|dedicat[oó]ria|sum[aá]rio|agradecimentos|ficha t[eé]cnica|sobre (o|a|os|as) autor(es|a|as)?|autores|notas?( da tradutora)?|capa|colof[aã]o|ep[ií]logo|pr[oó]logo|m[ií]dias sociais|landmarks|leia tamb[eé]m|ilustra[cç][oõ]es|aviso)\b/iu;
const NOTES_SIGNATURE = /ibid\.|op\. cit\./i;
const NUMBERED_NOTE_LINE = /^\s*\d+\.\s/gm;
const NOTE_TITLE_PATTERN = /^(notas?|notas da tradutora|notes?)\b/iu;

/**
 * Junta páginas estruturais (abertura de parte, página de título de capítulo)
 * ao capítulo seguinte. Sem isso, uma página como "PARTE I" ou o título com
 * epígrafe vira um capítulo próprio, quase vazio, no meio da leitura.
 */
export class StructuralPageMerger {
  static merge(chapters: ExtractedChapter[]): ExtractedChapter[] {
    const merged = [...chapters];

    // De trás para frente: uma sequência "parte + página de título + conteúdo"
    // é absorvida pelo conteúdo e depois a parte é absorvida pelo conjunto.
    for (let index = merged.length - 2; index >= 0; index -= 1) {
      const chapter = merged[index];
      const next = merged[index + 1];
      if (!StructuralPageMerger.isStructuralShape(chapter)) continue;

      // Entre a abertura e o conteúdo pode haver uma página de nota curta.
      // Nesse caso a nota vai para o fim do capítulo, em vez de bloquear a
      // junção e deixar a abertura sozinha.
      if (StructuralPageMerger.isNotePage(next)) {
        const contentIndex = StructuralPageMerger.findContentAfterNotes(
          merged,
          index + 1,
        );
        if (contentIndex !== -1) {
          const notes = merged.slice(index + 1, contentIndex);
          merged[contentIndex] = StructuralPageMerger.mergeWithNotes(
            chapter,
            notes,
            merged[contentIndex],
          );
          merged.splice(index, contentIndex - index);
          continue;
        }
      }

      if (next.text.trim().length < MIN_NEXT_CONTENT_CHARS) continue;

      merged[index + 1] = StructuralPageMerger.mergeInto(chapter, next);
      merged.splice(index, 1);
    }

    return merged;
  }

  private static isStructuralShape(chapter: ExtractedChapter): boolean {
    const title = chapter.title?.trim() ?? '';
    if (title.length === 0) return false;
    if (NON_STRUCTURAL_TITLE_PATTERN.test(title)) return false;

    const text = chapter.text.trim();
    if (text.length === 0 || text.length > MAX_STRUCTURAL_CHARS) return false;
    if (StructuralPageMerger.looksLikeNotes(text)) return false;

    return (
      StructuralPageMerger.matchesPart(title, text) ||
      StructuralPageMerger.isTitlePage(title, text)
    );
  }

  private static isNotePage(chapter: ExtractedChapter): boolean {
    const text = chapter.text.trim();
    if (text.length === 0 || text.length > MAX_NOTE_PAGE_CHARS) return false;

    const title = chapter.title?.trim() ?? '';
    if (title.length > 0 && !NOTE_TITLE_PATTERN.test(title)) return false;

    const lowerText = text.toLocaleLowerCase('pt-BR');
    return (
      lowerText.startsWith('nota') ||
      lowerText.startsWith('*') ||
      lowerText.startsWith('[')
    );
  }

  private static findContentAfterNotes(
    chapters: ExtractedChapter[],
    startIndex: number,
  ): number {
    let index = startIndex;
    while (
      index < chapters.length &&
      StructuralPageMerger.isNotePage(chapters[index])
    ) {
      index += 1;
    }

    const content = chapters[index];
    if (content === undefined) return -1;
    if (content.text.trim().length < MIN_NEXT_CONTENT_CHARS) return -1;

    return index;
  }

  private static matchesPart(title: string, text: string): boolean {
    const firstLine = StructuralPageMerger.firstLine(text);

    return PART_PATTERN.test(title) || PART_PATTERN.test(firstLine);
  }

  private static isTitlePage(title: string, text: string): boolean {
    const normalizedTitle = StructuralPageMerger.normalizeForCompare(title);
    const normalizedText = StructuralPageMerger.normalizeForCompare(text);
    if (normalizedTitle.length < 3) return false;

    return (
      normalizedText === normalizedTitle ||
      normalizedText.startsWith(normalizedTitle) ||
      normalizedTitle.startsWith(normalizedText)
    );
  }

  private static looksLikeNotes(text: string): boolean {
    const numberedLines = text.match(NUMBERED_NOTE_LINE)?.length ?? 0;

    return numberedLines >= 2 || NOTES_SIGNATURE.test(text);
  }

  private static mergeInto(
    chapter: ExtractedChapter,
    next: ExtractedChapter,
  ): ExtractedChapter {
    const title = chapter.title?.trim() ?? '';
    const isPartPage = StructuralPageMerger.matchesPart(title, chapter.text);
    const mergedTitle = isPartPage
      ? next.title?.trim() || title
      : StructuralPageMerger.mergeTitles(title, next.title);
    const mergedText = StructuralPageMerger.shouldPrepend(chapter, next)
      ? `${chapter.text.trim()}\n\n${next.text.trim()}`
      : next.text;

    return {
      position: next.position,
      title: mergedTitle.slice(0, MAX_TITLE_LENGTH),
      text: mergedText,
    };
  }

  private static mergeWithNotes(
    chapter: ExtractedChapter,
    notes: ExtractedChapter[],
    content: ExtractedChapter,
  ): ExtractedChapter {
    const merged = StructuralPageMerger.mergeInto(chapter, content);
    const notesText = notes
      .map((note) => note.text.trim())
      .filter((text) => text.length > 0)
      .join('\n\n');

    if (notesText.length === 0) return merged;

    return { ...merged, text: `${merged.text}\n\n${notesText}` };
  }

  private static shouldPrepend(
    chapter: ExtractedChapter,
    next: ExtractedChapter,
  ): boolean {
    const chapterText = StructuralPageMerger.normalizeForCompare(chapter.text);
    const nextText = StructuralPageMerger.normalizeForCompare(next.text);
    if (nextText.startsWith(chapterText)) return false;

    // Página que é só o título e o conteúdo já começa pelo mesmo título:
    // não duplicar o heading.
    const title = StructuralPageMerger.normalizeForCompare(
      chapter.title ?? '',
    );
    const isOnlyTitle = chapterText.length <= 120;
    if (isOnlyTitle && title.length > 0 && nextText.startsWith(title)) {
      return false;
    }

    return true;
  }

  private static mergeTitles(
    title: string,
    nextTitle: string | null | undefined,
  ): string {
    const normalizedNextTitle = (nextTitle ?? '').trim();
    if (normalizedNextTitle.length === 0) return title;

    const normalizedTitle = StructuralPageMerger.normalizeForCompare(title);
    const normalizedNext = StructuralPageMerger.normalizeForCompare(
      normalizedNextTitle,
    );
    if (normalizedTitle === normalizedNext) return title;

    const combined = `${title} — ${normalizedNextTitle}`;
    return combined.length <= MAX_TITLE_LENGTH ? combined : title;
  }

  private static firstLine(text: string): string {
    return text.split(/\n+/).find((line) => line.trim().length > 0)?.trim() ?? '';
  }

  private static normalizeForCompare(text: string): string {
    return text
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }
}
