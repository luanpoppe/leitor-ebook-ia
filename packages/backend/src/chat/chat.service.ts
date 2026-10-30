import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AIMessages, AITools, type AIModelNames } from '@luanpoppe/ai';
import { z } from 'zod';
import {
  ChapterReadingRepository,
  type ChapterSummaryRecord,
} from '../catalog/chapter-reading.repository';
import { EbookNotFoundError, EbookNotReadyError } from '../catalog/catalog.errors';
import { EbookRepository } from '../catalog/ebook.repository';
import { AI_CLIENT, type AiClient } from '../core/ai/ai.provider';
import { Book, BookStatus, ChatRole } from '../generated/prisma/client';
import { ImageService } from '../images/image.service';
import { EmbeddingService } from '../indexing/embedding.service';
import { EmbeddingUnavailableError } from '../indexing/indexing.errors';
import { SearchService } from '../search/search.service';
import { NotesService } from '../notes/notes.service';
import { DictionaryService } from '../dictionary/dictionary.service';
import { HighlightsService } from '../highlights/highlights.service';
import { ChatNotesTools, type ChatNoteAction } from './chat-notes-tools';
import { ChatDictionaryTools } from './chat-dictionary-tools';
import { ChatHighlightsTools } from './chat-highlights-tools';
import {
  ChatPromptBuilder,
  MAX_SEARCH_EXCERPTS,
  type ChatBookMetadata,
  type ChatCitation,
  type ChatExcerpt,
} from './chat-prompt.builder';
import type { ChatTools } from './chat-tools.types';
import { ChatQueryPlanner } from './chat-query-planner';
import type { ChatPlan } from './chat-query-planner';
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
  type ConversationListWithBooksResponse,
  type ConversationDetailWithBookResponse,
  type ConversationResponse,
  type ConversationSummaryResponse,
  type ConversationWithBookResponse,
} from './chat.schemas';
import { ChunkSearchRepository, type ChunkMatch } from './chunk-search.repository';
import {
  ConversationRepository,
  type ConversationSummary,
  type ConversationWithBookAndMessages,
  type ConversationWithBookSummary,
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
const MAX_READ_SECTIONS = 3;
const MAX_IMAGE_CONTEXT_CHUNKS = 6;
const MAX_IMAGE_SEARCH_RESULTS = 3;
const IMAGE_PROMPT_MAX_TOKENS = 2_500;

interface AskInput {
  question: string;
  scope: ChatScope;
  position: number;
  offset: number;
  contextStart?: number;
  contextEnd?: number;
  selection?: string;
  selectionBefore?: string;
}
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
    private readonly searchService: SearchService,
    private readonly notesService: NotesService,
    private readonly dictionaryService: DictionaryService,
    private readonly highlightsService: HighlightsService,
    private readonly imageService: ImageService,
    @Inject(AI_CLIENT) private readonly client: AiClient,
  ) {}

  async listConversations(bookId: string): Promise<ConversationListResponse> {
    const book = await this.requireReadyBook(bookId);
    const conversations = await this.conversationRepository.listByBook(book.id);

    return { items: conversations.map(toConversationSummary) };
  }

  /** Conversas de todos os livros (página global de conversas). */
  async listAllConversations(): Promise<ConversationListWithBooksResponse> {
    const conversations = await this.conversationRepository.listAll();

    return { items: conversations.map(toConversationWithBook) };
  }

  async getConversationById(
    conversationId: string,
  ): Promise<ConversationDetailWithBookResponse> {
    const conversation =
      await this.conversationRepository.findWithMessagesById(conversationId);
    if (conversation === null) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    return toConversationWithBookAndMessages(conversation);
  }

  async createConversation(bookId: string): Promise<ConversationResponse> {
    const book = await this.requireReadyBook(bookId);
    const conversation = await this.conversationRepository.create(book.id);

    return toConversation(conversation, book.id);
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

    return toConversation(conversation, book.id);
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
      selection?: string;
      selectionBefore?: string;
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

    const summaries = await this.readingRepository.listChapterSummaries(book.id);
    const allowedSummaries = summaries.filter(
      (summary) =>
        input.scope === 'whole-book' || summary.position < input.position,
    );
    const plan = await this.queryPlanner.plan({
      question: input.question,
      bookTitle: book.title,
      chapters: allowedSummaries,
      scope: input.scope,
      position: input.position,
      selection: input.selection,
    });

    if (plan.wantsImage && !plan.wantsDictionaryImage) {
      return this.askWithImage(book, conversation, input, plan);
    }

    const excerpts = await this.findExcerpts(
      book,
      input,
      plan,
      allowedSummaries,
    );
    const history = await this.conversationRepository.findRecentMessages(
      conversation.id,
      HISTORY_LIMIT,
    );
    const noteActions = new Map<string, ChatNoteAction>();
    const answer = await this.requestAnswer(
      book,
      input.question,
      excerpts,
      history,
      this.buildTools(book.id, conversation.id, noteActions),
    );

    const citations = ChatPromptBuilder.toCitations(excerpts);
    const title = conversation.title ?? buildTitle(input.question);
    const exchange = await this.conversationRepository.saveExchange({
      conversationId: conversation.id,
      title: conversation.title === null ? title : null,
      question: input.question,
      answer,
      citations,
      selection: input.selection ?? null,
      noteActions: [...noteActions.values()],
    });

    this.logger.log(
      `Chat respondido (livro ${book.id}, conversa ${conversation.id}, escopo ${input.scope}, ${excerpts.length} trecho(s)).`,
    );

    return {
      conversationId: conversation.id,
      messages: [
        toMessage(exchange.userMessage, book.id),
        toMessage(exchange.assistantMessage, book.id),
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
      selection?: string;
      selectionBefore?: string;
    },
    plan: ChatPlan,
    allowedSummaries: ChapterSummaryRecord[],
  ): Promise<ChatExcerpt[]> {
    const range = resolveReadingRange(input);
    const readingExcerpt = await this.findReadingExcerpt(
      book.id,
      input.position,
      range,
    );
    const readSections = await this.readingRepository.listReadSections(
      book.id,
      input.position,
      input.offset,
      MAX_READ_SECTIONS,
    );
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

    if (input.selection !== undefined) {
      const selectionText =
        input.selectionBefore !== undefined
          ? `${input.selectionBefore}\n\n⟦início do trecho selecionado⟧\n\n${input.selection}`
          : input.selection;
      excerpts.push({
        kind: 'selection',
        chapterPosition: input.position,
        chapterTitle: readingExcerpt?.chapterTitle ?? null,
        offset: input.offset,
        text: selectionText,
      });
    }
    if (readingExcerpt !== null) excerpts.push(readingExcerpt);
    excerpts.push(
      ...readSections.map((section) => ({
        kind: 'section' as const,
        chapterPosition: input.position,
        chapterTitle: readingExcerpt?.chapterTitle ?? null,
        offset: section.startOffset,
        text: section.summary,
      })),
    );
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
      `Contexto montado: buscas=${plan.queries.length} [${plan.queries.join(' | ')}], resumos=${summaryExcerpts.length} [${plan.chapters.join(', ')}], secoes=${readSections.length}, trechos=${searchMatches.length}, selecao=${input.selection === undefined ? 'nao' : 'sim'}.`,
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

    try {
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
    } catch (error) {
      const isEmbeddingFailure = error instanceof EmbeddingUnavailableError;
      if (!isEmbeddingFailure) throw error;

      this.logger.error(
        `Busca indisponível (embedding): ${error.message}`,
        error.stack,
      );
      throw new ChatUnavailableError(
        'Não foi possível consultar o provedor de IA agora. Tente de novo.',
      );
    }
  }

  private async findReadingExcerpt(    bookId: string,
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

  /** Ferramentas do chat: busca exata no livro e anotações do leitor. */
  private buildTools(
    bookId: string,
    conversationId: string,
    noteActions: Map<string, ChatNoteAction>,
  ): ChatTools {
    return [
      ...this.buildSearchTools(bookId),
      ...ChatNotesTools.build(this.notesService, bookId, (action) => {
        noteActions.set(action.noteId, action);
      }),
      ...ChatDictionaryTools.build(
        this.dictionaryService,
        this.imageService,
        bookId,
        conversationId,
      ),
      ...ChatHighlightsTools.build(this.highlightsService, bookId),
    ];
  }

  /** Ferramenta de busca exata que o modelo decide quando usar. */
  private buildSearchTools(bookId: string): ChatTools {
    const tools = new AITools();
    const searchTool = tools.createTool({
      name: 'buscar_no_livro',
      description:
        'Busca um termo ou frase exata no livro (sem diferenciar maiúsculas). Use para conferir nomes, lugares e passagens específicas. Devolve os trechos com capítulo e posição.',
      schema: z.object({
        termo: z.string().trim().min(2).max(120),
      }),
      toolFunction: async ({ termo }) => {
        const result = await this.searchService.search(bookId, termo, 5);
        if (result.items.length === 0) {
          return `Nenhuma ocorrência de "${termo}" no livro.`;
        }

        return result.items
          .map((item) => {
            const chapter = item.chapterTitle
              ? `Capítulo ${item.chapterPosition} — ${item.chapterTitle}`
              : `Capítulo ${item.chapterPosition}`;
            return `${chapter}: "${item.snippet}"`;
          })
          .join('\n\n');
      },
    });

    return [searchTool];
  }

  private async askWithImage(
    book: Book,
    conversation: ConversationWithMessages,
    input: AskInput,
    plan: ChatPlan,
  ): Promise<AskQuestionResponse> {
    const subject = plan.imageSubject.trim() || input.question;
    const { blocks, citations } = await this.findImageContext(
      book.id,
      subject,
      plan.queries,
    );
    const imagePlan = await this.buildImagePlan(book, subject, blocks);
    this.logger.log(
      `Prompt de imagem (${subject}): ${imagePlan.prompt.slice(0, 400)}`,
    );
    const image = await this.imageService.generate({
      bookId: book.id,
      conversationId: conversation.id,
      prompt: imagePlan.prompt,
    });

    const answer = `Aqui está a imagem de ${subject}.\n\n${imagePlan.explanation}`;
    const title = conversation.title ?? buildTitle(input.question);
    const exchange = await this.conversationRepository.saveExchange({
      conversationId: conversation.id,
      title: conversation.title === null ? title : null,
      question: input.question,
      answer,
      citations,
      selection: input.selection ?? null,
      imageId: image.id,
    });

    this.logger.log(
      `Imagem gerada (livro ${book.id}, conversa ${conversation.id}, modelo ${image.model}).`,
    );

    return {
      conversationId: conversation.id,
      messages: [
        toMessage(exchange.userMessage, book.id),
        toMessage(exchange.assistantMessage, book.id),
      ],
    };
  }

  /** Descrições do livro usadas para montar o prompt visual. */
  private async findImageContext(
    bookId: string,
    subject: string,
    queries: string[],
  ): Promise<{ blocks: string[]; citations: ChatCitation[] }> {
    const terms = [subject, ...queries].slice(0, MAX_QUERIES);
    const vectors = await Promise.all(
      terms.map((term) => this.embeddingService.embedQuery(term)),
    );
    const resultSets = await Promise.all(
      vectors.map((vector) =>
        this.chunkSearchRepository.search(bookId, vector, CANDIDATE_LIMIT),
      ),
    );
    const semantic = mergeMatches(resultSets).slice(
      0,
      MAX_IMAGE_CONTEXT_CHUNKS,
    );
    const lexical = await this.searchService.search(
      bookId,
      subject,
      MAX_IMAGE_SEARCH_RESULTS,
    );
    const blocks: string[] = [];
    const citations: ChatCitation[] = [];

    for (const match of semantic) {
      blocks.push(
        `${describeChapter(match.chapterPosition, match.chapterTitle)}: ${match.text}`,
      );
      citations.push({
        index: citations.length + 1,
        chapterPosition: match.chapterPosition,
        chapterTitle: match.chapterTitle,
        offset: match.charOffset,
        snippet: truncateSnippet(match.text),
      });
    }
    for (const item of lexical.items) {
      blocks.push(
        `${describeChapter(item.chapterPosition, item.chapterTitle)}: ${item.snippet}`,
      );
      citations.push({
        index: citations.length + 1,
        chapterPosition: item.chapterPosition,
        chapterTitle: item.chapterTitle,
        offset: item.offset,
        snippet: truncateSnippet(item.snippet),
      });
    }

    return { blocks, citations };
  }

  private async buildImagePlan(
    book: Book,
    subject: string,
    context: string[],
  ): Promise<{ prompt: string; explanation: string }> {
    if (this.client === null) throw new ChatUnavailableError();

    const excerpts = context.length > 0 ? context.join('\n\n') : '(sem trechos)';
    const { response } = await this.client.callStructuredOutput({
      aiModel: CHAT_MODEL,
      outputSchema: z.object({
        prompt: z.string().trim().min(10).max(2_000),
        explanation: z.string().trim().min(20).max(1_200),
      }),
      systemPrompt: [
        'Você prepara a geração de uma imagem a partir de um livro e explica a escolha.',
        'Devolva dois campos:',
        '- prompt: em inglês, descrição visual detalhada (aparência, roupas, ambiente, luz, clima e estilo de ilustração de fantasia), sem texto e sem marca d\'água, usando SOMENTE o que os trechos informam.',
        '- explanation: em português do Brasil, breve (no máximo 1.000 caracteres): comece com uma frase sobre a cena e liste de 2 a 4 itens no formato "- **elemento** — por que entrou", ligando cada escolha a um trecho e mencionando o capítulo quando ajudar. Não repita o prompt em inglês e não invente fatos.',
        'Quando faltar detalhe, complete de forma coerente com o texto, sem contradizê-lo.',
      ].join('\n'),
      messages: [
        AIMessages.human(
          [
            `Livro: ${book.title}${book.author ? `, de ${book.author}` : ''}`,
            `Pedido do leitor: ${subject}`,
            '',
            'Trechos do livro:',
            excerpts,
          ].join('\n'),
        ),
      ],
      modelConfig: {
        reasoningEffort: 'low',
        maxTokens: IMAGE_PROMPT_MAX_TOKENS,
        temperature: 0.5,
      },
      aiModelsFallback: [CHAT_FALLBACK_MODEL],
    });

    return { prompt: response.prompt, explanation: response.explanation };
  }

  private async requestAnswer(    book: ChatBookMetadata,
    question: string,
    excerpts: ChatExcerpt[],
    history: StoredMessage[],
    tools: ChatTools,
  ): Promise<string> {
    const systemPrompt = ChatPromptBuilder.buildSystemPrompt(
      book,
      excerpts.some((excerpt) => excerpt.kind === 'reading'),
      excerpts.some((excerpt) => excerpt.kind === 'selection'),
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
        agent: tools.length > 0 ? { tools } : undefined,
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

function toConversationWithBook(
  conversation: ConversationWithBookSummary,
): ConversationWithBookResponse {
  return {
    id: conversation.id,
    bookId: conversation.bookId,
    bookTitle: conversation.bookTitle,
    bookAuthor: conversation.bookAuthor,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation.messageCount,
  };
}

function toConversationWithBookAndMessages(
  conversation: ConversationWithBookAndMessages,
): ConversationDetailWithBookResponse {
  return {
    id: conversation.id,
    bookId: conversation.bookId,
    bookTitle: conversation.bookTitle,
    bookAuthor: conversation.bookAuthor,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
    messages: conversation.messages.map((message) =>
      toMessage(message, conversation.bookId),
    ),
  };
}

function toConversation(
  conversation: ConversationWithMessages,
  bookId: string,
): ConversationResponse {
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((message) =>
      toMessage(message, bookId),
    ),
  };
}

function toMessage(
  message: StoredMessage,
  bookId: string,
): ChatMessageResponse {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    selection: message.selection,
    imageUrl:
      message.imageId === null
        ? null
        : `/ebooks/${bookId}/images/${message.imageId}`,
    citations: toCitations(message.citations),
    noteActions: toNoteActions(message.noteActions),
    createdAt: message.createdAt.toISOString(),
  };
}

function describeChapter(
  position: number,
  title: string | null,
): string {
  if (title === null || title.length === 0) return `Capítulo ${position}`;

  return `Capítulo ${position} — ${title}`;
}

function truncateSnippet(text: string): string {
  const normalText = text.replace(/\s+/g, ' ').trim();
  if (normalText.length <= 280) return normalText;

  return `${normalText.slice(0, 280).trimEnd()}…`;
}

function toCitations(value: unknown): ChatCitation[] {
  const isArray = Array.isArray(value);
  if (!isArray) return [];

  return value as ChatCitation[];
}

function toNoteActions(value: unknown): ChatNoteAction[] {
  const isArray = Array.isArray(value);
  if (!isArray) return [];

  return value as ChatNoteAction[];
}
