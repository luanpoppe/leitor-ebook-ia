const EXCERPT_LENGTH = 160;

/** Texto curto para a lista, sem os marcadores mais óbvios de markdown. */
export function noteExcerpt(content: string): string {
  const plainText = content
    .replace(/[#>*_`~[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= EXCERPT_LENGTH) return plainText;

  return `${plainText.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

export function noteChapterLabel(chapterPosition: number | null): string {
  if (chapterPosition === null) return "Livro todo";

  return `Capítulo ${chapterPosition}`;
}
