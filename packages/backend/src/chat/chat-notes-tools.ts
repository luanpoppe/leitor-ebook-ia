import { AITools } from '@luanpoppe/ai';
import { z } from 'zod';
import { InvalidNoteChapterError } from '../notes/notes.errors';
import type { NoteResponse } from '../notes/notes.schemas';
import { NotesService } from '../notes/notes.service';
import type { ChatTools } from './chat-tools.types';

const LIST_LIMIT = 20;
const EXCERPT_LENGTH = 300;

/**
 * Ferramentas de anotações do chat. Todas operam no livro da conversa; o
 * modelo só recebe ids pelas ferramentas de leitura, então não há como uma
 * conversa tocar nas anotações de outro livro.
 */
export class ChatNotesTools {
  static build(notes: NotesService, bookId: string): ChatTools {
    const tools = new AITools();

    const listTool = tools.createTool({
      name: 'listar_anotacoes',
      description:
        'Lista as anotações deste livro (título, capítulo, data e um trecho). Use antes de responder o que o leitor já anotou ou antes de editar/excluir uma anotação, para obter o id correto.',
      schema: z.object({
        termo: z.string().trim().min(2).max(120).optional(),
      }),
      toolFunction: async ({ termo }) => {
        try {
          const items = await notes.list(bookId, termo);
          return formatNoteList(items);
        } catch (error) {
          return toToolError(error);
        }
      },
    });

    const readTool = tools.createTool({
      name: 'ler_anotacao',
      description:
        'Lê o conteúdo completo de uma anotação pelo id. Use quando o trecho devolvido por listar_anotacoes não bastar para responder ou antes de reescrever o conteúdo.',
      schema: z.object({
        id: z.string().uuid(),
      }),
      toolFunction: async ({ id }) => {
        try {
          const note = await notes.get(bookId, id);
          return formatNoteContent(note);
        } catch (error) {
          return toToolError(error);
        }
      },
    });

    const createTool = tools.createTool({
      name: 'criar_anotacao',
      description:
        'Cria uma anotação em markdown sobre este livro. Use quando o leitor pedir para salvar um resumo, uma explicação, ou anotações sobre personagens, lugares e acontecimentos. Informe o capítulo quando a nota vier de um capítulo específico.',
      schema: z.object({
        titulo: z.string().trim().min(1).max(120),
        conteudo: z.string().trim().min(1).max(20_000),
        capitulo: z.number().int().min(1).optional(),
      }),
      toolFunction: async ({ titulo, conteudo, capitulo }) => {
        try {
          const note = await notes.create(bookId, {
            title: titulo,
            content: conteudo,
            chapterPosition: capitulo ?? null,
          });

          return `Anotação criada: "${note.title}" (id ${note.id}).`;
        } catch (error) {
          return toToolError(error);
        }
      },
    });

    const updateTool = tools.createTool({
      name: 'atualizar_anotacao',
      description:
        'Atualiza título, conteúdo e/ou capítulo de uma anotação existente. Obtenha o id com listar_anotacoes. Para remover o vínculo com o capítulo, envie capitulo como null.',
      schema: z
        .object({
          id: z.string().uuid(),
          titulo: z.string().trim().min(1).max(120).optional(),
          conteudo: z.string().trim().min(1).max(20_000).optional(),
          capitulo: z.number().int().min(1).nullable().optional(),
        })
        .refine(
          (input) =>
            input.titulo !== undefined ||
            input.conteudo !== undefined ||
            input.capitulo !== undefined,
          { message: 'Informe ao menos um campo para atualizar.' },
        ),
      toolFunction: async ({ id, titulo, conteudo, capitulo }) => {
        try {
          const note = await notes.update(bookId, id, {
            ...(titulo !== undefined ? { title: titulo } : {}),
            ...(conteudo !== undefined ? { content: conteudo } : {}),
            ...(capitulo !== undefined ? { chapterPosition: capitulo } : {}),
          });

          return `Anotação atualizada: "${note.title}" (id ${note.id}).`;
        } catch (error) {
          return toToolError(error);
        }
      },
    });

    const deleteTool = tools.createTool({
      name: 'excluir_anotacao',
      description:
        'Exclui uma anotação pelo id. Só use depois que o leitor confirmar explicitamente a exclusão da anotação mostrada na resposta anterior; nunca exclua no mesmo pedido em que a exclusão foi solicitada sem confirmação.',
      schema: z.object({
        id: z.string().uuid(),
      }),
      toolFunction: async ({ id }) => {
        try {
          await notes.remove(bookId, id);
          return `Anotação ${id} excluída.`;
        } catch (error) {
          return toToolError(error);
        }
      },
    });

    return [listTool, readTool, createTool, updateTool, deleteTool];
  }
}

function formatNoteList(notes: NoteResponse[]): string {
  if (notes.length === 0) return 'Nenhuma anotação encontrada.';

  const visibleNotes = notes.slice(0, LIST_LIMIT);
  const header =
    notes.length > LIST_LIMIT
      ? `Mostrando ${LIST_LIMIT} de ${notes.length} anotações (as mais recentes):`
      : `${notes.length} anotação(ões):`;
  const blocks = visibleNotes.map((note) => formatNoteSummary(note));

  return [header, ...blocks].join('\n\n');
}

function formatNoteSummary(note: NoteResponse): string {
  const chapter =
    note.chapterPosition === null
      ? 'livro todo'
      : `capítulo ${note.chapterPosition}`;
  const excerpt = note.content.replace(/\s+/g, ' ').slice(0, EXCERPT_LENGTH);
  const ellipsis = note.content.length > EXCERPT_LENGTH ? '…' : '';

  return `id=${note.id} | "${note.title}" | ${chapter} | atualizada em ${note.updatedAt}\nTrecho: ${excerpt}${ellipsis}`;
}

function formatNoteContent(note: NoteResponse): string {
  const chapter =
    note.chapterPosition === null
      ? 'livro todo'
      : `capítulo ${note.chapterPosition}`;

  return [
    `id=${note.id}`,
    `Título: ${note.title}`,
    `Capítulo: ${chapter}`,
    'Conteúdo:',
    note.content,
  ].join('\n');
}

function toToolError(error: unknown): string {
  if (error instanceof InvalidNoteChapterError) {
    return 'Esse capítulo não existe neste livro. Confira a posição do capítulo e tente de novo.';
  }
  if (error instanceof Error) return error.message;

  return 'Não foi possível concluir a operação de anotação.';
}
