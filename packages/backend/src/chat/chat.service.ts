import { Inject, Injectable, Logger } from '@nestjs/common';
import { AIMessages, type AIModelNames } from '@luanpoppe/ai';
import { ChapterReadingRepository } from '../catalog/chapter-reading.repository';
import { EbookNotFoundError, EbookNotReadyError } from '../catalog/catalog.errors';
import { EbookRepository } from '../catalog/ebook.repository';
import { AI_CLIENT, type AiClient } from '../core/ai/ai.provider';
import { BookStatus, ChatRole } from '../generated/prisma/client';
import { EmbeddingService } from '../indexing/embedding.service';
import {
  ChatPromptBuilder,
  MAX_SEARCH_EXCERPTS,
  type ChatBookMetadata,
  type ChatCitation,
  type ChatExcerpt,
} from './chat-prompt.builder';
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

    const excerpts = await this.findExcerpts(book.id, input);
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
    bookId: string,
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
    const readingExcerpt = await this.findReadingExcerpt(bookId, input.position, range);
    const vector = await this.embeddingService.embedQuery(input.question);
    const matches = await this.chunkSearchRepository.search(
      bookId,
      vector,
      CANDIDATE_LIMIT,
    );
    const scopedMatches = matches.filter((match) =>
      isInsideScope(match, input.scope, input.position, input.offset),
    );
    const searchMatches = scopedMatches
      .filter(
        (match) => !isInsideReadingRange(match, input.position, range),
      )
      .slice(0, MAX_SEARCH_EXCERPTS);
    const excerpts: ChatExcerpt[] = [];

    if (readingExcerpt !== null) excerpts.push(readingExcerpt);
    searchMatches.forEach((match) => {
      excerpts.push({
        index: excerpts.length + 1,
        kind: 'search',
        chapterPosition: match.chapterPosition,
        chapterTitle: match.chapterTitle,
        offset: match.charOffset,
        text: match.text,
      });
    });

    if (excerpts.length === 0) {
      throw new ChatContextUnavailableError(
        'Nenhum trecho do livro atende ao escopo escolhido. Tente o livro todo.',
      );
    }

    return excerpts;
  }

  private async findReadingExcerpt(
    bookId: string,
    position: number,
    range: ReadingRange,
  ): Promise<ChatExcerpt | null> {
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
      index: 1,
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
