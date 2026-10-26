export interface ChatBookMetadata {
  title: string;
  author: string | null;
}

export type ChatExcerptKind = "reading" | "summary" | "search" | "selection";

export interface ChatExcerpt {
  /** Número usado pelo modelo para citar (`[1]`, `[2]`...). */
  index: number;
  /** `reading` = página atual e anteriores; `search` = busca semântica. */
  kind: ChatExcerptKind;
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

export const MAX_SEARCH_EXCERPTS = 6;
export const MAX_EXCERPT_CHARS = 1_200;
// A leitura atual é enviada inteira (página atual + duas anteriores), então
// tem um teto próprio, bem maior que o de um trecho de busca.
export const MAX_READING_CONTEXT_CHARS = 8_000;
// Resumo já nasce curto; o teto só protege contra um resumo fora do padrão.
export const MAX_SUMMARY_EXCERPT_CHARS = 1_400;
// Seleção do leitor: é o foco da pergunta, então vai inteira (até o teto que o
// schema aceita).
export const MAX_SELECTION_EXCERPT_CHARS = 4_000;

/**
 * Monta o prompt do chat. O modelo recebe metadados do livro e trechos
 * numerados; ele cita pelo número e a resposta guarda a referência para o
 * leitor pular até a passagem.
 */
export class ChatPromptBuilder {
  static buildSystemPrompt(
    book: ChatBookMetadata,
    hasReadingContext: boolean,
    hasSelection = false,
  ): string {
    const authorship = book.author ? `, de ${book.author}` : '';
    const lines = [
      `Você é um assistente de leitura que responde perguntas sobre o livro "${book.title}"${authorship}.`,
      'Responda em português do Brasil, de forma direta e útil, sem repetir a pergunta.',
      'Use SOMENTE os trechos fornecidos. Se a resposta não estiver neles, diga que não encontrou essa informação nos trechos disponíveis.',
      'Os trechos podem ser literais do livro ou resumos de capítulo. Use os resumos para visão geral e os trechos literais para detalhes.',
      'Ao usar um trecho, cite o número entre colchetes — por exemplo [1] ou [2][3]. Nunca invente números de trecho.',
      'Não invente fatos sobre o livro que não estejam nos trechos.',
    ];
    if (hasReadingContext) {
      lines.push(
        'O trecho identificado como "Leitura atual" é a página atual e as duas anteriores do leitor. Quando a pergunta for sobre o que está na tela, responda com base nele e cite o número correspondente.',
      );
    }
    if (hasSelection) {
      lines.push(
        'O trecho identificado como "Trecho selecionado pelo leitor" é o foco da pergunta: responda especificamente sobre ele e use o restante só como apoio.',
      );
    }

    return lines.join('\n');
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
    const { label, maxChars } = ChatPromptBuilder.describeExcerpt(
      excerpt,
      chapterLabel,
    );
    const text = ChatPromptBuilder.truncate(excerpt.text, maxChars);

    return `[${excerpt.index}] ${label}:\n"${text}"`;
  }

  private static describeExcerpt(
    excerpt: ChatExcerpt,
    chapterLabel: string,
  ): { label: string; maxChars: number } {
    if (excerpt.kind === 'reading') {
      return {
        label: `Leitura atual (página atual e duas anteriores) — ${chapterLabel}`,
        maxChars: MAX_READING_CONTEXT_CHARS,
      };
    }
    if (excerpt.kind === 'summary') {
      return {
        label: `Resumo de ${chapterLabel}`,
        maxChars: MAX_SUMMARY_EXCERPT_CHARS,
      };
    }
    if (excerpt.kind === 'selection') {
      return {
        label: `Trecho selecionado pelo leitor — ${chapterLabel}`,
        maxChars: MAX_SELECTION_EXCERPT_CHARS,
      };
    }

    return { label: chapterLabel, maxChars: MAX_EXCERPT_CHARS };
  }

  private static truncate(text: string, maxChars: number): string {
    const isLongText = text.length > maxChars;
    if (!isLongText) return text;

    return `${text.slice(0, maxChars).trimEnd()}…`;
  }
}
