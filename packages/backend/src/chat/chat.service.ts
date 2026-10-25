import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIMessages, type AIModelNames } from '@luanpoppe/ai';
import {
  ChapterReadingRepository,
  type ChapterSummaryRecord,
} from '../catalog/chapter-reading.repository';
import { EbookNotFoundError, EbookNotReadyError } from '../catalog/catalog.errors';
import { EbookRepository } from '../catalog/ebook.repository';
import { AI_CLIENT, type AiClient } from '../core/ai/ai.provider';
import { Book, BookStatus, ChatRole } from '../generated/prisma/client';
import { EmbeddingService } from '../indexing/embedding.service';
import {
  ChatPromptBuilder,
  MAX_SEARCH_EXCERPTS,
  type ChatBookMetadata,
  type ChatCitation,
  type ChatExcerpt,
} from './chat-prompt.builder';
import { ChatQueryPlanner } from './chat-query-planner';
import {
  ChatContextUnavailableError,
  ChatUnavailableError,
  ConversationNotFoundError,
} from './chat.errors';
import {
  type AskQuestionResponse,
  type ChatMessageResponse,
  type ChatScope,
  type ConversationListResponse,
  type ConversationResponse,
  type ConversationSummaryResponse,
} from './chat.schemas';
import { ChunkSearchRepository, type ChunkMatch } from './chunk-search.repository';
import {
  ConversationRepository,
  type ConversationSummary,
  type ConversationWithMessages,
  type StoredMessage,
} from './conversation.repository';

/**
 * Modelo e comportamento do chat — configuração do produto, hardcoded de
 * propósito. O fallback cobre o caso de o slug novo ainda não estar roteável.
 */
const CHAT_MODEL: AIModelNames = 'openrouter/deepseek/deepseek-v4.1-flash';
const CHAT_FALLBACK_MODEL: AIModelNames =
  'openrouter/deepseek/deepseek-v4-flash';
const CANDIDATE_LIMIT = 40;
const HISTORY_LIMIT = 10;
const MAX_TITLE_LENGTH = 80;
const ANSWER_MAX_TOKENS = 1_200;
const ANSWER_TEMPERATURE = 0.3;
const MAX_QUERIES = 3;
// Sem os offsets do cliente, ainda mandamos um trecho de leitura aproximado:
// 6 mil caracteres antes do topo e 2 mil depois.
const FALLBACK_READING_BEFORE = 6_000;
const FALLBACK_READING_AFTER = 2_000;
const MAX_READING_RANGE_CHARS = 12_000;

/**
 * Chat do livro: conversas persistidas e respostas com base nos trechos
 * indexados. A recuperação é sempre semântica — o escopo só decide se os
 * trechos depois da posição atual entram na busca.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly ebookRepository: EbookRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly chunkSearchRepository: ChunkSearchRepository,
    private readonly readingRepository: ChapterReadingRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly queryPlanner: ChatQueryPlanner,
    @Inject(AI_CLIENT) private readonly client: AiClient,
  ) {}

  async listConversations(bookId: string): Promise<ConversationListResponse> {
    const book = await this.requireReadyBook(bookId);
    const conversations = await this.conversationRepository.listByBook(book.id);

    return { items: conversations.map(toConversationSummary) };
  }

  async createConversation(bookId: string): Promise<ConversationResponse> {
    const book = await this.requireReadyBook(bookId);
    const conversation = await this.conversationRepository.create(book.id);

    return toConversation(conversation);
  }

  async getConversation(
    bookId: string,
    conversationId: string,
  ): Promise<ConversationResponse> {
    const book = await this.requireReadyBook(bookId);
    const conversation = await this.conversationRepository.findWithMessages(
      book.id,
      conversationId,
    );
    if (conversation === null) {
      throw new ConversationNotFoundError(book.id, conversationId);
    }

    return toConversation(conversation);
  }

  async deleteConversation(
    bookId: string,
    conversationId: string,
  ): Promise<void> {
    const book = await this.requireReadyBook(bookId);
    const wasDeleted = await this.conversationRepository.delete(
      book.id,
      conversationId,
    );
    if (!wasDeleted) {
      throw new ConversationNotFoundError(book.id, conversationId);
    }
  }

  async ask(
    bookId: string,
    conversationId: string,
    input: {
      question: string;
      scope: ChatScope;
      position: number;
      offset: number;
      contextStart?: number;
      contextEnd?: number;
    },
  ): Promise<AskQuestionResponse> {
    const book = await this.requireReadyBook(bookId);
    const conversation = await this.conversationRepository.findWithMessages(
      book.id,
      conversationId,
    );
    if (conversation === null) {
      throw new ConversationNotFoundError(book.id, conversationId);
    }
    if (this.client === null) throw new ChatUnavailableError();

    const excerpts = await this.findExcerpts(book, input);
    const history = await this.conversationRepository.findRecentMessages(
      conversation.id,
      HISTORY_LIMIT,
    );
    const answer = await this.requestAnswer(
      book,
      input.question,
      excerpts,
      history,
    );

    const citations = ChatPromptBuilder.toCitations(excerpts);
    const title = conversation.title ?? buildTitle(input.question);
    const exchange = await this.conversationRepository.saveExchange({
      conversationId: conversation.id,
      title: conversation.title === null ? title : null,
      question: input.question,
      answer,
      citations,
    });

    this.logger.log(
      `Chat respondido (livro ${book.id}, conversa ${conversation.id}, escopo ${input.scope}, ${excerpts.length} trecho(s)).`,
    );

    return {
      conversationId: conversation.id,
      messages: [
        toMessage(exchange.userMessage),
        toMessage(exchange.assistantMessage),
      ],
    };
  }

  private async findExcerpts(
    book: Book,
    input: {
      question: string;
      scope: ChatScope;
      position: number;
      offset: number;
      contextStart?: number;
      contextEnd?: number;
    },
  ): Promise<ChatExcerpt[]> {
    const range = resolveReadingRange(input);
    const readingExcerpt = await this.findReadingExcerpt(
      book.id,
      input.position,
      range,
    );
    const summaries = await this.readingRepository.listChapterSummaries(book.id);
    const allowedSummaries = summaries.filter(
      (summary) =>
        input.scope === 'whole-book' || summary.position <= input.position,
    );
    const plan = await this.queryPlanner.plan({
      question: input.question,
      bookTitle: book.title,
      chapters: allowedSummaries,
      scope: input.scope,
      position: input.position,
    });
    const searchMatches = await this.searchMatches(
      book.id,
      plan.queries,
      input,
      range,
    );
    const summaryExcerpts = toSummaryExcerpts(
      plan.chapters,
      allowedSummaries,
    );
    const excerpts: Array<Omit<ChatExcerpt, 'index'>> = [];

    if (readingExcerpt !== null) excerpts.push(readingExcerpt);
    excerpts.push(...summaryExcerpts);
    excerpts.push(
      ...searchMatches.map((match) => ({
        kind: 'search' as const,
        chapterPosition: match.chapterPosition,
        chapterTitle: match.chapterTitle,
        offset: match.charOffset,
        text: match.text,
      })),
    );

    if (excerpts.length === 0) {
      throw new ChatContextUnavailableError(
        'Nenhum trecho do livro atende ao escopo escolhido. Tente o livro todo.',
      );
    }

    this.logger.log(
      `Contexto montado: buscas=${plan.queries.length} [${plan.queries.join(' | ')}], resumos=${summaryExcerpts.length}, trechos=${searchMatches.length}.`,
    );

    return excerpts.map((excerpt, index) => ({ ...excerpt, index: index + 1 }));
  }

  /** Uma busca por termo do plano, todas em paralelo, fundidas por trecho. */
  private async searchMatches(
    bookId: string,
    queries: string[],
    input: { scope: ChatScope; position: number; offset: number },
    range: ReadingRange,
  ): Promise<ChunkMatch[]> {
    const terms = queries.slice(0, MAX_QUERIES);
    const vectors = await Promise.all(
      terms.map((term) => this.embeddingService.embedQuery(term)),
    );
    const resultSets = await Promise.all(
      vectors.map((vector) =>
        this.chunkSearchRepository.search(bookId, vector, CANDIDATE_LIMIT),
      ),
    );

    return mergeMatches(resultSets)
      .filter((match) =>
        isInsideScope(match, input.scope, input.position, input.offset),
      )
      .filter(
        (match) => !isInsideReadingRange(match, input.position, range),
      )
      .slice(0, MAX_SEARCH_EXCERPTS);
  }

  private async findReadingExcerpt(
    bookId: string,
    position: number,
    range: ReadingRange,
  ): Promise<Omit<ChatExcerpt, 'index'> | null> {
    const length = range.end - range.start;
    if (length <= 0) return null;

    const chapter = await this.readingRepository.findPage(
      bookId,
      position,
      range.start,
      Math.min(length, MAX_READING_RANGE_CHARS),
    );
    const text = chapter?.text.trim() ?? '';
    if (chapter === null || text.length === 0) return null;

    return {
      kind: 'reading',
      chapterPosition: chapter.position,
      chapterTitle: chapter.title,
      offset: range.start,
      text: chapter.text,
    };
  }

  private async requestAnswer(
    book: ChatBookMetadata,
    question: string,
    excerpts: ChatExcerpt[],
    history: StoredMessage[],
  ): Promise<string> {
    const systemPrompt = ChatPromptBuilder.buildSystemPrompt(
      book,
      excerpts.some((excerpt) => excerpt.kind === 'reading'),
    );
    const userPrompt = ChatPromptBuilder.buildUserPrompt(question, excerpts);
    const historyMessages = history.map((message) =>
      message.role === ChatRole.USER
        ? AIMessages.human(message.content)
        : AIMessages.ai(message.content),
    );

    try {
      const response = await this.client?.call({
        aiModel: CHAT_MODEL,
        systemPrompt,
        messages: [...historyMessages, AIMessages.human(userPrompt)],
        modelConfig: {
          reasoningEffort: 'low',
          maxTokens: ANSWER_MAX_TOKENS,
          temperature: ANSWER_TEMPERATURE,
        },
        aiModelsFallback: [CHAT_FALLBACK_MODEL],
      });

      const answer = response?.text.trim() ?? '';
      if (answer.length === 0) {
        throw new ChatUnavailableError('A IA respondeu vazio. Tente de novo.');
      }

      return answer;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Falha ao consultar o modelo do chat: ${normalizedError.message}`,
        normalizedError.stack,
      );

      throw new ChatUnavailableError(
        'Não foi possível consultar a IA agora. Tente de novo.',
      );
    }
  }

  private async requireReadyBook(bookId: string) {
    const book = await this.ebookRepository.findById(bookId);
    if (book === null) throw new EbookNotFoundError(bookId);

    const isReady = book.status === BookStatus.READY;
    if (!isReady) throw new EbookNotReadyError(bookId, book.status);

    return book;
  }
}

function isInsideScope(
  match: ChunkMatch,
  scope: ChatScope,
  position: number,
  offset: number,
): boolean {
  if (scope === 'whole-book') return true;
  if (match.chapterPosition < position) return true;
  if (match.chapterPosition > position) return false;

  return match.charOffset <= offset;
}

interface ReadingRange {
  start: number;
  end: number;
}

/** Faixa de texto que o leitor está vendo, enviada pelo cliente. */
function resolveReadingRange(input: {
  offset: number;
  contextStart?: number;
  contextEnd?: number;
}): ReadingRange {
  const hasClientRange =
    input.contextStart !== undefined &&
    input.contextEnd !== undefined &&
    input.contextEnd > input.contextStart;

  if (hasClientRange) {
    const end = input.contextEnd as number;
    const requestedStart = input.contextStart as number;
    const start = Math.max(
      0,
      requestedStart,
      end - MAX_READING_RANGE_CHARS,
    );

    return { start, end };
  }

  return {
    start: Math.max(0, input.offset - FALLBACK_READING_BEFORE),
    end: input.offset + FALLBACK_READING_AFTER,
  };
}

/** Trecho que já está dentro da leitura atual não precisa vir da busca. */
function isInsideReadingRange(
  match: ChunkMatch,
  position: number,
  range: ReadingRange,
): boolean {
  const isSameChapter = match.chapterPosition === position;
  if (!isSameChapter) return false;

  return match.charOffset >= range.start && match.charOffset < range.end;
}

/**
 * Junta os resultados das buscas paralelas: o mesmo trecho pode aparecer em
 * mais de um termo, e aí vale a maior similaridade.
 */
function mergeMatches(resultSets: ChunkMatch[][]): ChunkMatch[] {
  const byKey = new Map<string, ChunkMatch>();

  for (const matches of resultSets) {
    for (const match of matches) {
      const key = `${match.chapterPosition}:${match.chunkPosition}`;
      const current = byKey.get(key);
      const isBetter =
        current === undefined || match.similarity > current.similarity;
      if (!isBetter) continue;

      byKey.set(key, match);
    }
  }

  return [...byKey.values()].sort(
    (left, right) => right.similarity - left.similarity,
  );
}

/** Resumos dos capítulos que o planejador escolheu. */
function toSummaryExcerpts(
  positions: number[],
  summaries: ChapterSummaryRecord[],
): Array<Omit<ChatExcerpt, 'index'>> {
  const summaryByPosition = new Map(
    summaries.map((summary) => [summary.position, summary]),
  );
  const excerpts: Array<Omit<ChatExcerpt, 'index'>> = [];

  for (const position of positions) {
    const summary = summaryByPosition.get(position);
    if (summary === undefined) continue;

    excerpts.push({
      kind: 'summary',
      chapterPosition: summary.position,
      chapterTitle: summary.title,
      // Resumo é visão geral do capítulo: o salto abre no começo dele.
      offset: 0,
      text: summary.summary,
    });
  }

  return excerpts;
}

function buildTitle(question: string): string {
  const singleLineQuestion = question.replace(/\s+/g, ' ').trim();
  const isLongQuestion = singleLineQuestion.length > MAX_TITLE_LENGTH;
  if (!isLongQuestion) return singleLineQuestion;

  return `${singleLineQuestion.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`;
}

function toConversationSummary(
  conversation: ConversationSummary,
): ConversationSummaryResponse {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation.messageCount,
  };
}

function toConversation(
  conversation: ConversationWithMessages,
): ConversationResponse {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map(toMessage),
  };
}

function toMessage(message: StoredMessage): ChatMessageResponse {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    citations: toCitations(message.citations),
    createdAt: message.createdAt.toISOString(),
  };
}

function toCitations(value: unknown): ChatCitation[] {
  const isArray = Array.isArray(value);
  if (!isArray) return [];

  return value as ChatCitation[];
}
