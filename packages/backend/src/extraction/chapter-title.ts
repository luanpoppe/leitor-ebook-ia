const MAX_TITLE_LENGTH = 200;

export class ChapterTitle {
  /**
   * Limpa o título extraído do capítulo, colapsando espaços e quebras de linha
   * em um único espaço.
   *
   * Títulos acima do limite são descartados em vez de truncados: um título
   * cortado costuma indicar que o extrator capturou conteúdo que não é título
   * (parágrafo, cabeçalho de página), então é mais seguro exibir o capítulo sem
   * nome do que com um nome suspeito.
   */
  static normalize(rawTitle?: string | null): string | null {
    if (rawTitle === undefined || rawTitle === null) return null;

    const collapsedTitle = rawTitle.replace(/\s+/g, ' ').trim();
    if (collapsedTitle.length === 0) return null;

    const codePointLength = [...collapsedTitle].length;
    if (codePointLength > MAX_TITLE_LENGTH) return null;

    return collapsedTitle;
  }
}
