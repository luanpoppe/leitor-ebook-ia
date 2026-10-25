export interface ChatBookMetadata {
  title: string;
  author: string | null;
}

export interface ChatExcerpt {
  /** Número usado pelo modelo para citar (`[1]`, `[2]`...). */
  index: number;
  chapterPosition: number;
  chapterTitle: string | null;
  offset: number;
  text: string;
}

export interface ChatCitation {
  index: number;
  chapterPosition: number;
  chapterTitle: string | null;
  offset: number;
}

export const MAX_EXCERPTS = 6;
export const MAX_EXCERPT_CHARS = 1_200;

/**
 * Monta o prompt do chat. O modelo recebe metadados do livro e trechos
 * numerados; ele cita pelo número e a resposta guarda a referência para o
 * leitor pular até a passagem.
 */
export class ChatPromptBuilder {
  static buildSystemPrompt(book: ChatBookMetadata): string {
    const authorship = book.author ? `, de ${book.author}` : '';

    return [
      `Você é um assistente de leitura que responde perguntas sobre o livro "${book.title}"${authorship}.`,
      'Responda em português do Brasil, de forma direta e útil, sem repetir a pergunta.',
      'Use SOMENTE os trechos fornecidos. Se a resposta não estiver neles, diga que não encontrou essa informação nos trechos disponíveis.',
      'Ao usar um trecho, cite o número entre colchetes — por exemplo [1] ou [2][3]. Nunca invente números de trecho.',
      'Não invente fatos sobre o livro que não estejam nos trechos.',
    ].join('\n');
  }

  static buildUserPrompt(question: string, excerpts: ChatExcerpt[]): string {
    const excerptBlocks = excerpts.map((excerpt) =>
      ChatPromptBuilder.formatExcerpt(excerpt),
    );
    const excerptsText = excerptBlocks.join('\n\n');

    return [
      'Trechos do livro:',
      excerptsText,
      '',
      `Pergunta do leitor: ${question}`,
    ].join('\n');
  }

  static toCitations(excerpts: ChatExcerpt[]): ChatCitation[] {
    return excerpts.map((excerpt) => ({
      index: excerpt.index,
      chapterPosition: excerpt.chapterPosition,
      chapterTitle: excerpt.chapterTitle,
      offset: excerpt.offset,
    }));
  }

  private static formatExcerpt(excerpt: ChatExcerpt): string {
    const chapterLabel = excerpt.chapterTitle
      ? `Capítulo ${excerpt.chapterPosition} — ${excerpt.chapterTitle}`
      : `Capítulo ${excerpt.chapterPosition}`;
    const text = ChatPromptBuilder.truncate(excerpt.text);

    return `[${excerpt.index}] ${chapterLabel}:\n"${text}"`;
  }

  private static truncate(text: string): string {
    const isLongText = text.length > MAX_EXCERPT_CHARS;
    if (!isLongText) return text;

    return `${text.slice(0, MAX_EXCERPT_CHARS).trimEnd()}…`;
  }
}
