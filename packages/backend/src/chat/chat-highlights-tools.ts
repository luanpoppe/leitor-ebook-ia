import { AITools } from '@luanpoppe/ai';
import { z } from 'zod';
import type { HighlightResponse } from '../highlights/highlights.schemas';
import { HighlightsService } from '../highlights/highlights.service';
import type { ChatTools } from './chat-tools.types';

const LIST_LIMIT = 50;
const EXCERPT_LENGTH = 300;

const COLOR_BY_TOOL_VALUE = {
  amarelo: 'yellow',
  verde: 'green',
  azul: 'blue',
  rosa: 'pink',
} as const;

const COLOR_LABEL = {
  yellow: 'amarelo',
  green: 'verde',
  blue: 'azul',
  pink: 'rosa',
} as const;

/**
 * Ferramenta de consulta das marcações do livro da conversa. O chat só lê as
 * marcações; criar e remover continua sendo uma ação manual do leitor.
 */
export class ChatHighlightsTools {
  static build(highlights: HighlightsService, bookId: string): ChatTools {
    const tools = new AITools();

    const listTool = tools.createTool({
      name: 'listar_marcacoes',
      description:
        'Lista as marcações de texto deste livro (trecho, cor, capítulo e data). Use quando o leitor perguntar o que marcou, pedir um resumo das passagens destacadas ou quiser consultar marcações de uma cor específica. Sem filtros, devolve todas as marcações do livro.',
      schema: z.object({
        cor: z.enum(['amarelo', 'verde', 'azul', 'rosa']).optional(),
        termo: z.string().trim().min(2).max(120).optional(),
      }),
      toolFunction: async ({ cor, termo }) => {
        try {
          const items = await highlights.list(bookId, {
            query: termo,
            color: cor === undefined ? undefined : COLOR_BY_TOOL_VALUE[cor],
          });
          return formatHighlightList(items);
        } catch (error) {
          return toToolError(error);
        }
      },
    });

    return [listTool];
  }
}

function formatHighlightList(highlights: HighlightResponse[]): string {
  if (highlights.length === 0) return 'Nenhuma marcação encontrada.';

  const visibleHighlights = highlights.slice(0, LIST_LIMIT);
  const header =
    highlights.length > LIST_LIMIT
      ? `Mostrando ${LIST_LIMIT} de ${highlights.length} marcações:`
      : `${highlights.length} marcação(ões):`;
  const blocks = visibleHighlights.map((highlight) =>
    formatHighlightSummary(highlight),
  );

  return [header, ...blocks].join('\n\n');
}

function formatHighlightSummary(highlight: HighlightResponse): string {
  const excerpt = highlight.quote.replace(/\s+/g, ' ').slice(0, EXCERPT_LENGTH);
  const ellipsis = highlight.quote.length > EXCERPT_LENGTH ? '…' : '';

  return [
    `id=${highlight.id} | cor=${COLOR_LABEL[highlight.color]} | capítulo ${highlight.chapterPosition} | criada em ${highlight.createdAt}`,
    `Trecho: "${excerpt}${ellipsis}"`,
  ].join('\n');
}

function toToolError(error: unknown): string {
  if (error instanceof Error) return error.message;

  return 'Não foi possível consultar as marcações.';
}
