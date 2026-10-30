import { AITools } from '@luanpoppe/ai';
import { z } from 'zod';
import { EbookNotFoundError } from '../catalog/catalog.errors';
import {
  InvalidDictionaryChapterError,
  InvalidDictionaryWordError,
} from '../dictionary/dictionary.errors';
import { DictionaryService } from '../dictionary/dictionary.service';
import { ImageGenerationError } from '../images/image-generation.service';
import type { ImageService } from '../images/image.service';
import type { ChatTools } from './chat-tools.types';

/**
 * Ferramentas do dicionário: salvar a palavra e, quando o leitor pedir,
 * gerar uma imagem para ela. O livro é sempre o da conversa.
 */
export class ChatDictionaryTools {
  static build(
    dictionary: DictionaryService,
    imageService: ImageService,
    bookId: string,
    conversationId: string,
  ): ChatTools {
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

    const imageTool = tools.createTool({
      name: 'gerar_imagem_para_palavra',
      description:
        'Gera uma imagem ilustrativa para uma palavra que já está no dicionário pessoal e vincula a imagem à entrada. Use SOMENTE quando o leitor pedir explicitamente uma imagem/ilustração da palavra; não gere imagens por conta própria. A palavra precisa existir no dicionário; se não existir, adicione primeiro com adicionar_ao_dicionario.',
      schema: z.object({
        palavra: z.string().trim().min(1).max(120),
        descricao: z.string().trim().min(1).max(600).optional(),
      }),
      toolFunction: async ({ palavra, descricao }) => {
        try {
          const entry = await dictionary.findByWord(palavra);
          if (entry === null) {
            return `A palavra "${palavra}" ainda não está no dicionário. Adicione primeiro com adicionar_ao_dicionario.`;
          }

          const prompt = buildDictionaryImagePrompt(
            entry.word,
            entry.meaning,
            descricao,
          );
          const image = await imageService.generate({
            bookId,
            conversationId,
            prompt,
          });
          const updated = await dictionary.attachImage(entry.id, image.id);

          return `Imagem gerada para "${updated.word}" e vinculada ao dicionário.`;
        } catch (error) {
          if (error instanceof ImageGenerationError) {
            return 'Não foi possível gerar a imagem agora. Tente de novo em instantes.';
          }
          if (error instanceof InvalidDictionaryWordError) {
            return 'Não consegui identificar uma palavra válida para gerar a imagem.';
          }
          if (error instanceof EbookNotFoundError) {
            return 'Não encontrei o livro desta conversa para gerar a imagem.';
          }
          if (error instanceof Error) return error.message;

          return 'Não foi possível gerar a imagem para esta palavra.';
        }
      },
    });

    return [addWordTool, imageTool];
  }
}

function buildDictionaryImagePrompt(
  word: string,
  meaning: string,
  description?: string,
): string {
  const visualDescription =
    description === undefined
      ? `Represente o objeto ou conceito de forma visual, coerente com o significado.`
      : `Descrição visual: ${description}.`;

  return [
    `Ilustração editorial para um dicionário, da palavra "${word}".`,
    `Significado: ${meaning}.`,
    visualDescription,
    'Sem texto, letras, legendas ou marcas d’água na imagem.',
    'Objeto centralizado, iluminação natural, fundo neutro claro, estilo realista e limpo.',
  ].join(' ');
}
