import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { Readable } from 'node:stream';
import type { ExtractedCover } from '../content.types';
import { EpubArchive } from './epub-archive';
import type { EpubManifestItem, EpubPackageDocument } from './epub-package';

const COVER_FORMATS: Record<string, { contentType: string; extension: string }> =
  {
    jpg: { contentType: 'image/jpeg', extension: 'jpg' },
    jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
    png: { contentType: 'image/png', extension: 'png' },
    gif: { contentType: 'image/gif', extension: 'gif' },
    webp: { contentType: 'image/webp', extension: 'webp' },
  };

/**
 * Extrai a capa declarada no OPF (EPUB3 `cover-image` ou EPUB2 `meta cover`).
 * Formatos que o storage não aceita (ex.: SVG) são ignorados.
 */
export class EpubCoverExtractor {
  static extract(
    archive: EpubArchive,
    packageDocument: EpubPackageDocument,
  ): ExtractedCover | undefined {
    const coverItem = EpubCoverExtractor.findCoverItem(packageDocument);
    if (!coverItem) return undefined;

    const coverPath = EpubArchive.resolveHref(
      packageDocument.packagePath,
      coverItem.href,
    );
    const extension = posix.extname(coverPath).slice(1).toLowerCase();
    const format = COVER_FORMATS[extension];
    if (!format) return undefined;

    const data = archive.readBuffer(coverPath);
    if (!data) return undefined;

    return {
      contentType: format.contentType,
      hash: createHash('sha256').update(data).digest('hex'),
      extension: format.extension,
      stream: Readable.from(data),
    };
  }

  private static findCoverItem(
    packageDocument: EpubPackageDocument,
  ): EpubManifestItem | undefined {
    const coverImage = packageDocument.manifestItems.find((item) =>
      item.properties.includes('cover-image'),
    );
    if (coverImage) return coverImage;

    if (!packageDocument.coverId) return undefined;

    return packageDocument.manifestById.get(packageDocument.coverId);
  }
}
