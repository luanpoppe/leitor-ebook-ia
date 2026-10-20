import { EpubArchive } from './epub-archive';
import type { EpubManifestItem, EpubPackageDocument } from './epub-package';
import { EpubXml } from './epub-xml';
import { HtmlToText } from './html-to-text';

const NCX_MEDIA_TYPE = 'application/x-dtbncx+xml';
const ANCHOR_PATTERN =
  /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const MIN_CONTENTS_LINK_COUNT = 3;
const MAX_CONTENTS_TEXT_LENGTH = 2000;
const MIN_LINK_TEXT_RATIO = 0.5;

export interface EpubTableOfContents {
  orderedPaths: string[];
  excludedPaths: Set<string>;
}

/**
 * Descobre o sumário do EPUB (nav no EPUB3, NCX no EPUB2).
 * Serve para duas coisas: ordenar os capítulos e evitar que o próprio sumário
 * entre como texto do livro.
 */
export class EpubTableOfContentsReader {
  static read(
    archive: EpubArchive,
    packageDocument: EpubPackageDocument,
  ): EpubTableOfContents {
    const navItem = packageDocument.manifestItems.find((item) =>
      item.properties.includes('nav'),
    );

    if (navItem) {
      return EpubTableOfContentsReader.readNavigationDocument(
        archive,
        packageDocument,
        navItem,
      );
    }

    const ncxItem = EpubTableOfContentsReader.findNcxItem(packageDocument);
    if (ncxItem) {
      return EpubTableOfContentsReader.readNcxDocument(
        archive,
        packageDocument,
        ncxItem,
      );
    }

    return { orderedPaths: [], excludedPaths: new Set() };
  }

  /**
   * Usa a ordem do sumário só quando ele lista exatamente os capítulos do
   * spine; caso contrário, a ordem do spine é a mais confiável.
   */
  static orderPaths(spinePaths: string[], tocPaths: string[]): string[] {
    if (tocPaths.length === 0) return spinePaths;

    const spinePathSet = new Set(spinePaths);
    const tocSpinePaths = [...new Set(tocPaths)].filter((path) =>
      spinePathSet.has(path),
    );

    const tocCoversEveryChapter = tocSpinePaths.length === spinePaths.length;
    return tocCoversEveryChapter ? tocSpinePaths : spinePaths;
  }

  static isTableOfContentsDocument(html: string): boolean {
    return /<nav[^>]+(?:epub:)?type\s*=\s*["'][^"']*\btoc\b/i.test(html);
  }

  /**
   * Sumário visível no EPUB2, que não tem `<nav epub:type="toc">`: uma página
   * curta feita quase só de links para outros documentos do spine.
   */
  static isLinkHeavyContentsDocument(
    html: string,
    spinePaths: string[],
    currentPath: string,
  ): boolean {
    const spinePathSet = new Set(spinePaths);
    const anchors = [...html.matchAll(ANCHOR_PATTERN)];
    const spineLinks = anchors
      .map((match) => ({
        path: EpubArchive.resolveHref(currentPath, match[1]),
        text: HtmlToText.convert(match[2]),
      }))
      .filter((link) => link.path !== currentPath)
      .filter((link) => spinePathSet.has(link.path));

    if (spineLinks.length < MIN_CONTENTS_LINK_COUNT) return false;

    const plainText = HtmlToText.convert(html);
    if (plainText.length === 0) return false;
    if (plainText.length >= MAX_CONTENTS_TEXT_LENGTH) return false;

    const linkTextLength = spineLinks.reduce(
      (sum, link) => sum + link.text.length,
      0,
    );
    const linksCoverMostText =
      linkTextLength >= plainText.length * MIN_LINK_TEXT_RATIO;

    return linksCoverMostText;
  }

  private static findNcxItem(
    packageDocument: EpubPackageDocument,
  ): EpubManifestItem | undefined {
    if (packageDocument.tocId) {
      const tocItem = packageDocument.manifestById.get(
        packageDocument.tocId,
      );
      if (tocItem) return tocItem;
    }

    return packageDocument.manifestItems.find(
      (item) => item.mediaType === NCX_MEDIA_TYPE,
    );
  }

  private static readNavigationDocument(
    archive: EpubArchive,
    packageDocument: EpubPackageDocument,
    navItem: EpubManifestItem,
  ): EpubTableOfContents {
    const navPath = EpubArchive.resolveHref(
      packageDocument.packagePath,
      navItem.href,
    );
    const navHtml = archive.readText(navPath);
    const navMatch = navHtml.match(
      /<nav[^>]*(?:epub:)?type\s*=\s*["'][^"']*\btoc\b[^>]*>([\s\S]*?)<\/nav>/i,
    );

    if (!navMatch) {
      return { orderedPaths: [], excludedPaths: new Set([navPath]) };
    }

    const hrefs = [...navMatch[1].matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
      .map((match) => EpubArchive.resolveHref(navPath, match[1]))
      .filter((path) => path.length > 0);

    return {
      orderedPaths: hrefs,
      excludedPaths: new Set([navPath]),
    };
  }

  private static readNcxDocument(
    archive: EpubArchive,
    packageDocument: EpubPackageDocument,
    ncxItem: EpubManifestItem,
  ): EpubTableOfContents {
    const ncxPath = EpubArchive.resolveHref(
      packageDocument.packagePath,
      ncxItem.href,
    );
    const ncxXml = archive.readText(ncxPath);
    const ncx = EpubXml.toRecord(EpubXml.parse(ncxXml).ncx);
    const navMap = EpubXml.toRecord(ncx.navMap);
    const sources: string[] = [];

    EpubTableOfContentsReader.collectNavPointSources(
      navMap.navPoint,
      sources,
    );

    return {
      orderedPaths: sources.map((source) =>
        EpubArchive.resolveHref(ncxPath, source),
      ),
      excludedPaths: new Set([ncxPath]),
    };
  }

  private static collectNavPointSources(
    navPoints: unknown,
    sources: string[],
  ): void {
    for (const navPoint of EpubXml.toArray(navPoints)) {
      const record = EpubXml.toRecord(navPoint);
      const source = EpubXml.readAttribute(record.content, '@_src');

      if (typeof source === 'string') sources.push(source);

      EpubTableOfContentsReader.collectNavPointSources(
        record.navPoint,
        sources,
      );
    }
  }
}
