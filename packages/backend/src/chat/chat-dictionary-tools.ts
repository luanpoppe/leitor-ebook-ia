import { AITools } from '@luanpoppe/ai';
import { z } from 'zod';
import { EbookNotFoundError } from '../catalog/catalog.errors';
import {
  InvalidDictionaryChapterError,
  InvalidDictionaryWordError,
} from '../dictionary/dictionary.errors';
import { DictionaryService } from '../dictionary/dictionary.service';
import type { ChatTools } from './chat-tools.types';

/**
 * Ferramenta que salva uma palavra no dicionário pessoal. O livro é sempre o
 * da conversa; o capítulo/trecho são opcionais e servem para lembrar onde a
 * palavra apareceu.
 */
export class ChatDictionaryTools {
  static build(dictionary: DictionaryService, bookId: string): ChatTools {
    const tools = new AITools();

    const addWordTool = tools.createTool({
      name: 'adicionar_ao_dicionario',
      description:
        'Adiciona uma palavra ao dicionário pessoal do leitor com significado e, quando possível, um exemplo e o trecho do livro onde ela apareceu. Use quando o leitor pedir explicitamente para salvar/adicionar uma palavra ou registrar o significado de um termo. O livro atual é vinculado automaticamente; informe o capítulo quando souber.',
      schema: z.object({
        palavra: z.string().trim().min(1).max(120),
        significado: z.string().trim().min(1).max(2_000),
        exemplo: z.string().trim().min(1).max(600).optional(),
        trecho: z.string().trim().min(1).max(1_500).optional(),
        capitulo: z.number().int().min(1).optional(),
      }),
      toolFunction: async ({
        palavra,
        significado,
        exemplo,
        trecho,
        capitulo,
      }) => {
        try {
          const result = await dictionary.save({
            bookId,
            word: palavra,
            meaning: significado,
            example: exemplo ?? null,
            quote: trecho ?? null,
            chapterPosition: capitulo ?? null,
          });

          const action = result.created ? 'adicionada ao' : 'atualizada no';
          return `Palavra "${result.entry.word}" ${action} dicionário pessoal (id ${result.entry.id}).`;
        } catch (error) {
          if (error instanceof InvalidDictionaryChapterError) {
            return 'Esse capítulo não existe neste livro. Confira a posição do capítulo e tente de novo.';
          }
          if (error instanceof InvalidDictionaryWordError) {
            return 'Não consegui identificar uma palavra válida para salvar.';
          }
          if (error instanceof EbookNotFoundError) {
            return 'Não encontrei o livro desta conversa para salvar a palavra.';
          }
          if (error instanceof Error) return error.message;

          return 'Não foi possível salvar a palavra no dicionário.';
        }
      },
    });

    return [addWordTool];
  }
}
