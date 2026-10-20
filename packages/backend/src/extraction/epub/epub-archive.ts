import AdmZip from 'adm-zip';
import { posix } from 'node:path';
import type { Readable } from 'node:stream';
import { ContentExtractionError } from '../content.types';

interface ZipEntry {
  entryName: string;
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
    const buffer = await EpubArchive.readStreamToBuffer(stream);

    try {
      return new EpubArchive(new AdmZip(buffer));
    } catch {
      throw new ContentExtractionError(
        'Não foi possível abrir o arquivo EPUB. O arquivo pode estar corrompido.',
      );
    }
  }

  readText(path: string): string {
    const entry = this.findEntry(path);

    if (!entry) {
      throw new ContentExtractionError(
        `EPUB inválido: o arquivo "${path}" não foi encontrado.`,
      );
    }

    return entry.getData().toString('utf8').replace(/^\uFEFF/, '');
  }

  readBuffer(path: string): Buffer | undefined {
    return this.findEntry(path)?.getData();
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
