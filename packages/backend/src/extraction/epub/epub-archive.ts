import AdmZip from 'adm-zip';
import { posix } from 'node:path';
import type { Readable } from 'node:stream';
import { ContentExtractionError } from '../content.types';
import { StreamUtils } from '../stream-utils';

const MAX_EPUB_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_COUNT = 5000;
const MAX_TOTAL_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_BUFFER_BYTES = 5 * 1024 * 1024;

const EPUB_SIZE_MESSAGE = 'EPUB excede o limite de tamanho suportado.';
const DOCUMENT_SIZE_MESSAGE =
  'O EPUB contém um documento grande demais para extração.';

interface ZipEntry {
  entryName: string;
  header: { size: number };
  getData(): Buffer;
}

/**
 * Leitura dos arquivos internos do EPUB (o pacote é um zip).
 * Esconde o zip e resolve o caminho relativo referenciado no OPF.
 */
export class EpubArchive {
  private readonly zip: AdmZip;

  private constructor(zip: AdmZip) {
    this.zip = zip;
  }

  static async open(stream: Readable): Promise<EpubArchive> {
    const buffer = await StreamUtils.readToBuffer(
      stream,
      MAX_EPUB_BYTES,
      EPUB_SIZE_MESSAGE,
    );
    const zip = EpubArchive.createZip(buffer);
    EpubArchive.assertWithinLimits(zip);

    return new EpubArchive(zip);
  }

  readText(path: string): string {
    const entry = this.findEntry(path);

    if (!entry) {
      throw new ContentExtractionError(
        `EPUB inválido: o arquivo "${path}" não foi encontrado.`,
      );
    }

    return this.readEntryText(entry);
  }

  /**
   * Igual a `readText`, mas devolve `undefined` quando a entrada não existe.
   * Um documento ausente do spine não deve derrubar o livro inteiro.
   */
  tryReadText(path: string): string | undefined {
    const entry = this.findEntry(path);
    if (!entry) return undefined;

    return this.readEntryText(entry);
  }

  readBuffer(path: string): Buffer | undefined {
    const entry = this.findEntry(path);
    if (!entry) return undefined;

    // A capa é opcional: imagem acima do teto é ignorada sem falhar o livro.
    if (entry.header.size > MAX_BUFFER_BYTES) return undefined;

    return entry.getData();
  }

  /**
   * Transforma um `href` relativo (baseado no OPF ou no sumário) em caminho
   * de entrada do zip: sem fragmento, sem `%` inválido e sem barra inicial.
   */
  static resolveHref(basePath: string, href: string): string {
    const hrefWithoutFragment = href.split('#')[0];

    if (hrefWithoutFragment.length === 0) return '';

    const decodedHref = EpubArchive.decodeHref(hrefWithoutFragment);
    const baseDirectory = posix.dirname(basePath);
    const joined =
      baseDirectory === '.'
        ? decodedHref
        : posix.join(baseDirectory, decodedHref);

    return posix.normalize(joined).replace(/^\/+/, '');
  }

  private static createZip(buffer: Buffer): AdmZip {
    try {
      return new AdmZip(buffer);
    } catch {
      throw new ContentExtractionError(
        'Não foi possível abrir o arquivo EPUB. O arquivo pode estar corrompido.',
      );
    }
  }

  private static assertWithinLimits(zip: AdmZip): void {
    const entries = zip.getEntries();
    const totalBytes = entries.reduce(
      (sum, entry) => sum + entry.header.size,
      0,
    );
    const exceedsEntryCount = entries.length > MAX_ENTRY_COUNT;
    const exceedsTotalBytes = totalBytes > MAX_TOTAL_ENTRY_BYTES;

    if (exceedsEntryCount || exceedsTotalBytes) {
      throw new ContentExtractionError(EPUB_SIZE_MESSAGE);
    }
  }

  private readEntryText(entry: ZipEntry): string {
    if (entry.header.size > MAX_DOCUMENT_BYTES) {
      throw new ContentExtractionError(DOCUMENT_SIZE_MESSAGE);
    }

    return entry.getData().toString('utf8').replace(/^\uFEFF/, '');
  }

  private static decodeHref(href: string): string {
    try {
      return decodeURIComponent(href);
    } catch {
      // Href com '%' inválido continua como veio; o lookup no zip decide.
      return href;
    }
  }

  private findEntry(path: string): ZipEntry | undefined {
    const lowerCasePath = path.toLowerCase();

    return this.zip
      .getEntries()
      .find((entry) => entry.entryName.toLowerCase() === lowerCasePath);
  }
}
