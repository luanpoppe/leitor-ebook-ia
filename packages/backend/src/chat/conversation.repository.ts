import { Injectable } from '@nestjs/common';
import { ChatRole, type Prisma } from '../generated/prisma/client';
import { PrismaService } from '../core/prisma.service';

export interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: Date;
  messageCount: number;
}

export interface StoredMessage {
  id: string;
  role: ChatRole;
  content: string;
  citations: unknown;
  createdAt: Date;
}

export interface ConversationWithMessages {
  id: string;
  title: string | null;
  messages: StoredMessage[];
}

export interface SaveExchangeInput {
  conversationId: string;
  /** Preenchido só quando a conversa ainda não tem título. */
  title: string | null;
  question: string;
  answer: string;
  citations: unknown[];
}

export interface SavedExchange {
  userMessage: StoredMessage;
  assistantMessage: StoredMessage;
}

const RECENT_MESSAGES_LIMIT = 10;

/**
 * Persistência das conversas do chat: uma conversa pertence a um livro e
 * guarda as mensagens em ordem cronológica.
 */
@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByBook(bookId: string): Promise<ConversationSummary[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { bookId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt,
      messageCount: row._count.messages,
    }));
  }

  async create(bookId: string): Promise<ConversationWithMessages> {
    const conversation = await this.prisma.conversation.create({
      data: { bookId },
      select: { id: true, title: true },
    });

    return { id: conversation.id, title: conversation.title, messages: [] };
  }

  async findWithMessages(
    bookId: string,
    conversationId: string,
  ): Promise<ConversationWithMessages | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, bookId },
      select: {
        id: true,
        title: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            citations: true,
            createdAt: true,
          },
        },
      },
    });

    return conversation ?? null;
  }

  async delete(bookId: string, conversationId: string): Promise<boolean> {
    const result = await this.prisma.conversation.deleteMany({
      where: { id: conversationId, bookId },
    });

    return result.count > 0;
  }

  /** Últimas mensagens para dar contexto ao modelo, da mais antiga à mais nova. */
  async findRecentMessages(
    conversationId: string,
    take = RECENT_MESSAGES_LIMIT,
  ): Promise<StoredMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        role: true,
        content: true,
        citations: true,
        createdAt: true,
      },
    });

    return rows.reverse();
  }

  async saveExchange(input: SaveExchangeInput): Promise<SavedExchange> {
    const citations = input.citations as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (transaction) => {
      const userMessage = await transaction.chatMessage.create({
        data: {
          conversationId: input.conversationId,
          role: ChatRole.USER,
          content: input.question,
        },
        select: { id: true, role: true, content: true, citations: true, createdAt: true },
      });
      const assistantMessage = await transaction.chatMessage.create({
        data: {
          conversationId: input.conversationId,
          role: ChatRole.ASSISTANT,
          content: input.answer,
          citations,
        },
        select: { id: true, role: true, content: true, citations: true, createdAt: true },
      });

      await transaction.conversation.update({
        where: { id: input.conversationId },
        data: {
          updatedAt: new Date(),
          title: input.title ?? undefined,
        },
      });

      return { userMessage, assistantMessage };
    });
  }
}
