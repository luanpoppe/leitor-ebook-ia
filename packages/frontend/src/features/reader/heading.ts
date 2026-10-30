const HEADING_PATTERN =
  /^(CAPÍTULO|CAPITULO|CHAPTER|PARTE|PART|PRÓLOGO|PROLOGO|EPÍLOGO|EPILOGO)\b/i;

const MAX_HEADING_LENGTH = 80;

/**
 * Título de capítulo que veio como parágrafo no texto (EPUB sem tag de
 * heading). A página e a régua de medição usam a mesma regra para o destaque
 * não mudar a quebra de linha medida.
 */
export class ReaderHeading {
  static isHeading(text: string): boolean {
    const trimmedText = text.trim();
    if (trimmedText.length === 0) return false;
    if (trimmedText.length > MAX_HEADING_LENGTH) return false;

    return HEADING_PATTERN.test(trimmedText);
  }
}
