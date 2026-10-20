import type { Readable } from 'node:stream';
import {
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ContentExtractionError } from '../content.types';
import type { PdfOutlineEntry } from './pdf-outline';

/**
 * Opções de leitura seguras para um PDF vindo do usuário: sem avaliação de
 * JavaScript embutido e sem tentar carregar fontes do sistema.
 */
const LOAD_OPTIONS = {
  isEvalSupported: false,
  useSystemFonts: false,
  disableFontFace: true,
  verbosity: 0,
} as const;

const CORRUPTED_FILE_MESSAGE =
  'Não foi possível abrir o arquivo PDF. O arquivo pode estar corrompido.';

interface PdfInfo {
  Title?: unknown;
  Author?: unknown;
}

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
}

interface PdfOutlineNode {
  title?: string;
  dest?: unknown;
  items?: PdfOutlineNode[];
}

interface PdfReference {
  num: number;
  gen: number;
}

/**
 * Envolve o documento aberto pelo pdf.js: texto por página, outline e Info.
 * O parser só lida com o domínio; detalhe do pdf.js fica aqui.
 */
export class PdfDocument {
  private constructor(private readonly document: PDFDocumentProxy) {}

  static async open(stream: Readable): Promise<PdfDocument> {
    const buffer = await PdfDocument.readStreamToBuffer(stream);
    const data = new Uint8Array(buffer);

    try {
      const loadingTask = getDocument({ data, ...LOAD_OPTIONS });
      const document = await loadingTask.promise;
      return new PdfDocument(document);
    } catch {
      throw new ContentExtractionError(CORRUPTED_FILE_MESSAGE);
    }
  }

  async readPageTexts(): Promise<string[]> {
    const texts: string[] = [];

    for (let pageNumber = 1; pageNumber <= this.document.numPages; pageNumber += 1) {
      const page = await this.document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = PdfDocument.toPageText(content.items);
      texts.push(pageText);
      page.cleanup();
    }

    return texts;
  }

  async readOutline(): Promise<PdfOutlineEntry[]> {
    const outline = await this.document.getOutline();
    if (!outline) return [];

    const entries: PdfOutlineEntry[] = [];
    await this.collectOutlineEntries(outline, entries);

    return entries;
  }

  async readMetadata(): Promise<{ title?: string; author?: string }> {
    const { info } = await this.document.getMetadata();
    const metadata = info as PdfInfo;

    return {
      title: PdfDocument.readTextValue(metadata.Title),
      author: PdfDocument.readTextValue(metadata.Author),
    };
  }

  /**
   * Fecha o documento sem mascarar o erro original da extração: se a leitura
   * falhou, o problema relevante é o da leitura.
   */
  async close(): Promise<void> {
    try {
      await this.document.destroy();
    } catch {
      // Documento já inválido; nada a recuperar no encerramento.
    }
  }

  private async collectOutlineEntries(
    nodes: PdfOutlineNode[],
    entries: PdfOutlineEntry[],
  ): Promise<void> {
    for (const node of nodes) {
      const pageIndex = await this.resolvePageIndex(node.dest);

      if (pageIndex !== undefined) {
        entries.push({ title: node.title ?? '', pageIndex });
      }

      await this.collectOutlineEntries(node.items ?? [], entries);
    }
  }

  private async resolvePageIndex(dest: unknown): Promise<number | undefined> {
    const destination = await this.resolveDestination(dest);
    if (!destination) return undefined;

    const reference = destination[0];
    if (!PdfDocument.isReference(reference)) return undefined;

    try {
      return await this.document.getPageIndex(reference);
    } catch {
      // Destino apontando para página inexistente: ignora o item do outline.
      return undefined;
    }
  }

  private async resolveDestination(
    dest: unknown,
  ): Promise<unknown[] | undefined> {
    if (typeof dest === 'string') {
      const destination = await this.document.getDestination(dest);
      return destination ? (destination as unknown[]) : undefined;
    }

    return Array.isArray(dest) ? (dest as unknown[]) : undefined;
  }

  private static toPageText(items: readonly unknown[]): string {
    const parts: string[] = [];

    for (const item of items) {
      if (!PdfDocument.isTextItem(item)) continue;

      parts.push(item.str);
      if (item.hasEOL) parts.push('\n');
    }

    return parts.join('');
  }

  private static isTextItem(item: unknown): item is PdfTextItem {
    const candidate = item as PdfTextItem;
    return typeof candidate.str === 'string';
  }

  private static isReference(value: unknown): value is PdfReference {
    const candidate = value as PdfReference;
    return (
      typeof candidate?.num === 'number' && typeof candidate?.gen === 'number'
    );
  }

  private static readTextValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
  }

  private static async readStreamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      const chunkValue: unknown = chunk;
      const chunkBuffer = Buffer.isBuffer(chunkValue)
        ? chunkValue
        : Buffer.from(chunkValue as Uint8Array);
      chunks.push(chunkBuffer);
    }

    return Buffer.concat(chunks);
  }
}
