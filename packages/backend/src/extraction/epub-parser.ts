import { Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  ContentExtractionError,
  type ExtractedChapter,
  type ExtractionResult,
} from './content.types';
import { EpubArchive } from './epub/epub-archive';
import { EpubCoverExtractor } from './epub/epub-cover';
import {
  EpubPackageReader,
  type EpubManifestItem,
  type EpubPackageDocument,
} from './epub/epub-package';
import {
  EpubTableOfContentsReader,
  type EpubTableOfContents,
} from './epub/epub-toc';
import { HtmlToText } from './epub/html-to-text';
import { TextNormalizer } from './text-normalizer';

const XHTML_MEDIA_TYPES = new Set(['application/xhtml+xml', 'text/html']);

/**
 * Orquestra a extração de um EPUB: abre o pacote, decide a ordem dos
 * capítulos (spine + sumário), converte cada documento em texto e entrega os
 * metadados. O detalhe de zip/OPF/sumário/HTML mora nos módulos de `./epub`.
 */
@Injectable()
export class EpubParser {
  async parse(stream: Readable): Promise<ExtractionResult> {
    try {
      return await this.extract(stream);
    } catch (error) {
      if (error instanceof ContentExtractionError) throw error;

      throw new ContentExtractionError(
        'Não foi possível ler o arquivo EPUB. O arquivo pode estar corrompido.',
      );
    }
  }

  private async extract(stream: Readable): Promise<ExtractionResult> {
    const archive = await EpubArchive.open(stream);
    const packageDocument = EpubPackageReader.read(archive);
    const rawChapterTexts = this.collectChapterTexts(
      archive,
      packageDocument,
    );

    const chapters = TextNormalizer.normalizeChapters(
      rawChapterTexts.map((text, index) => ({
        position: index + 1,
        text,
      })),
    );

    if (chapters.length === 0) {
      throw new ContentExtractionError('O EPUB não contém texto extraível.');
    }

    return {
      chapters,
      fullText: this.joinChapters(chapters),
      metadata: {
        title: packageDocument.title,
        author: packageDocument.author,
        cover: EpubCoverExtractor.extract(archive, packageDocument),
      },
    };
  }

  private collectChapterTexts(
    archive: EpubArchive,
    packageDocument: EpubPackageDocument,
  ): string[] {
    const tableOfContents = EpubTableOfContentsReader.read(
      archive,
      packageDocument,
    );
    const spinePaths = this.listSpinePaths(packageDocument);
    const spineTexts = this.readDocumentTexts(
      archive,
      spinePaths,
      tableOfContents,
    );

    if (spineTexts.length > 0) return spineTexts;

    // Sem spine utilizável, cada documento XHTML ainda pode conter parte do
    // livro; juntar tudo evita perder conteúdo e mantém o capítulo único.
    const allPaths = packageDocument.manifestItems
      .filter((item) => XHTML_MEDIA_TYPES.has(item.mediaType))
      .map((item) =>
        EpubArchive.resolveHref(packageDocument.packagePath, item.href),
      );
    const allTexts = this.readDocumentTexts(
      archive,
      allPaths,
      tableOfContents,
    );

    return allTexts.length > 1 ? [allTexts.join('\n\n')] : allTexts;
  }

  private listSpinePaths(packageDocument: EpubPackageDocument): string[] {
    const spinePaths = packageDocument.spineIds
      .map((id) => packageDocument.manifestById.get(id))
      .filter(
        (item): item is EpubManifestItem =>
          item !== undefined && XHTML_MEDIA_TYPES.has(item.mediaType),
      )
      .map((item) =>
        EpubArchive.resolveHref(packageDocument.packagePath, item.href),
      );

    return [...new Set(spinePaths)];
  }

  private readDocumentTexts(
    archive: EpubArchive,
    paths: string[],
    tableOfContents: EpubTableOfContents,
  ): string[] {
    const chapterPaths = paths.filter(
      (path) => !tableOfContents.excludedPaths.has(path),
    );
    const orderedPaths = EpubTableOfContentsReader.orderPaths(
      chapterPaths,
      tableOfContents.orderedPaths,
    );

    return orderedPaths
      .map((path) => archive.readText(path))
      .filter(
        (html) =>
          !EpubTableOfContentsReader.isTableOfContentsDocument(html),
      )
      .map((html) => HtmlToText.convert(html))
      .filter((text) => text.length > 0);
  }

  private joinChapters(chapters: ExtractedChapter[]): string {
    return chapters.map((chapter) => chapter.text).join('\n\n');
  }
}
