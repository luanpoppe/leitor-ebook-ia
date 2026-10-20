import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { Readable } from 'node:stream';
import type { ExtractedCover } from '../content.types';
import { EpubArchive } from './epub-archive';
import type { EpubPackageDocument } from './epub-package';

const COVER_FORMATS: Record<string, { contentType: string; extension: string }> =
  {
    jpg: { contentType: 'image/jpeg', extension: 'jpg' },
    jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
    png: { contentType: 'image/png', extension: 'png' },
    gif: { contentType: 'image/gif', extension: 'gif' },
    webp: { contentType: 'image/webp', extension: 'webp' },
  };
const IMAGE_SOURCE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i;

interface CoverFormat {
  contentType: string;
  extension: string;
}

/**
 * Extrai a capa declarada no OPF: EPUB3 `cover-image`, EPUB2 `meta cover` ou
 * referência `guide`. Formatos que o storage não aceita (ex.: SVG) são ignorados.
 */
export class EpubCoverExtractor {
  static extract(
    archive: EpubArchive,
    packageDocument: EpubPackageDocument,
  ): ExtractedCover | undefined {
    const coverReference =
      EpubCoverExtractor.findCoverReference(packageDocument);
    if (!coverReference) return undefined;

    const coverPath = EpubArchive.resolveHref(
      packageDocument.packagePath,
      coverReference,
    );

    return EpubCoverExtractor.readCover(archive, coverPath);
  }

  private static findCoverReference(
    packageDocument: EpubPackageDocument,
  ): string | undefined {
    const coverImage = packageDocument.manifestItems.find((item) =>
      item.properties.includes('cover-image'),
    );
    if (coverImage) return coverImage.href;

    if (packageDocument.coverId) {
      const coverItem = packageDocument.manifestById.get(
        packageDocument.coverId,
      );
      if (coverItem) return coverItem.href;
    }

    return packageDocument.guideCoverHref;
  }

  /**
   * O guia do EPUB2 costuma apontar para uma página XHTML de capa; nesse caso
   * a imagem real é o primeiro `<img>` de dentro dela.
   */
  private static readCover(
    archive: EpubArchive,
    coverPath: string,
  ): ExtractedCover | undefined {
    const coverFormat = EpubCoverExtractor.resolveFormat(coverPath);
    if (coverFormat) {
      return EpubCoverExtractor.readImage(archive, coverPath, coverFormat);
    }

    const html = archive.tryReadText(coverPath);
    if (html === undefined) return undefined;

    const imageHref = EpubCoverExtractor.findFirstImageHref(html);
    if (imageHref === undefined) return undefined;

    const imagePath = EpubArchive.resolveHref(coverPath, imageHref);
    const imageFormat = EpubCoverExtractor.resolveFormat(imagePath);
    if (!imageFormat) return undefined;

    return EpubCoverExtractor.readImage(archive, imagePath, imageFormat);
  }

  private static readImage(
    archive: EpubArchive,
    path: string,
    format: CoverFormat,
  ): ExtractedCover | undefined {
    const data = archive.readBuffer(path);
    if (!data) return undefined;

    return {
      contentType: format.contentType,
      hash: createHash('sha256').update(data).digest('hex'),
      extension: format.extension,
      stream: Readable.from(data),
    };
  }

  private static resolveFormat(path: string): CoverFormat | undefined {
    const extension = posix.extname(path).slice(1).toLowerCase();

    return COVER_FORMATS[extension];
  }

  private static findFirstImageHref(html: string): string | undefined {
    const match = html.match(IMAGE_SOURCE_PATTERN);

    return match?.[1];
  }
}
