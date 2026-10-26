import { Injectable } from '@nestjs/common';
import { SearchRepository, type TextSearchMatch } from './search.repository';

const SNIPPET_BEFORE_CHARS = 140;
const SNIPPET_AFTER_CHARS = 200;

export interface SearchResultItem {
  chapterPosition: number;
  chapterTitle: string | null;
  offset: number;
  snippet: string;
  rank: number;
}

export interface SearchResponse {
  items: SearchResultItem[];
}

/**
 * Busca do leitor: devolve o trecho ao redor da ocorrência para dar contexto,
 * mesmo quando o FTS casou por radical e não pelo texto literal.
 */
@Injectable()
export class SearchService {
  constructor(private readonly repository: SearchRepository) {}

  async search(
    bookId: string,
    query: string,
    limit: number,
  ): Promise<SearchResponse> {
    const matches = await this.repository.search(bookId, query, limit);

    return {
      items: matches.map((match) => this.toItem(match, query)),
    };
  }

  private toItem(match: TextSearchMatch, query: string): SearchResultItem {
    return {
      chapterPosition: match.chapterPosition,
      chapterTitle: match.chapterTitle,
      offset: match.offset,
      snippet: this.buildSnippet(match.text, query),
      rank: match.rank,
    };
  }

  private buildSnippet(text: string, query: string): string {
    const normalText = text.replace(/\s+/g, ' ').trim();
    const normalQuery = query.replace(/\s+/g, ' ').trim();
    const matchIndex = this.findMatchIndex(normalText, normalQuery);

    if (matchIndex < 0) {
      return this.truncate(normalText);
    }

    const start = Math.max(0, matchIndex - SNIPPET_BEFORE_CHARS);
    const end = Math.min(
      normalText.length,
      matchIndex + normalQuery.length + SNIPPET_AFTER_CHARS,
    );
    const prefix = start > 0 ? '…' : '';
    const suffix = end < normalText.length ? '…' : '';

    return `${prefix}${normalText.slice(start, end)}${suffix}`;
  }

  /** Primeiro tenta a frase inteira; depois, a primeira palavra relevante. */
  private findMatchIndex(text: string, query: string): number {
    const lowerText = text.toLocaleLowerCase('pt-BR');
    const lowerQuery = query.toLocaleLowerCase('pt-BR');
    const phraseIndex = lowerText.indexOf(lowerQuery);
    if (phraseIndex >= 0) return phraseIndex;

    const words = lowerQuery.split(' ').filter((word) => word.length >= 3);
    for (const word of words) {
      const wordIndex = lowerText.indexOf(word);
      if (wordIndex >= 0) return wordIndex;
    }

    return -1;
  }

  private truncate(text: string): string {
    if (text.length <= SNIPPET_AFTER_CHARS) return text;

    return `${text.slice(0, SNIPPET_AFTER_CHARS)}…`;
  }
}
