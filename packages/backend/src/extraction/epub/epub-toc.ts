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
  /** Rótulo do sumário por caminho do zip (sem fragmento). */
  labelsByPath: Map<string, string>;
}

interface NcxNavPointEntry {
  source: string;
  label: string | null;
  depth: number;
}

interface LabelCandidate {
  label: string;
  depth: number;
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

    return {
      orderedPaths: [],
      excludedPaths: new Set(),
      labelsByPath: new Map(),
    };
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
      const tocItem = packageDocument.manifestById.get(packageDocument.tocId);
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
      return {
        orderedPaths: [],
        excludedPaths: new Set([navPath]),
        labelsByPath: new Map(),
      };
    }

    const navContent = navMatch[1];
    const hrefs = [...navContent.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
      .map((match) => EpubArchive.resolveHref(navPath, match[1]))
      .filter((path) => path.length > 0);
    const labelsByPath = EpubTableOfContentsReader.collectNavigationLabels(
      navPath,
      navContent,
    );

    return {
      orderedPaths: hrefs,
      excludedPaths: new Set([navPath]),
      labelsByPath,
    };
  }

  private static collectNavigationLabels(
    navPath: string,
    navContent: string,
  ): Map<string, string> {
    const candidatesByPath = new Map<string, LabelCandidate>();

    for (const match of navContent.matchAll(ANCHOR_PATTERN)) {
      const path = EpubArchive.resolveHref(navPath, match[1]);
      if (path.length === 0) continue;

      const label = HtmlToText.convert(match[2]);
      if (label.length === 0) continue;

      const anchorIndex = match.index ?? 0;
      const prefix = navContent.slice(0, anchorIndex);
      const depth = EpubTableOfContentsReader.countListDepth(prefix);

      EpubTableOfContentsReader.keepMoreSpecificLabel(candidatesByPath, path, {
        label,
        depth,
      });
    }

    return EpubTableOfContentsReader.toLabelsByPath(candidatesByPath);
  }

  private static countListDepth(prefix: string): number {
    const openings = prefix.match(/<(?:ol|ul)\b/gi)?.length ?? 0;
    const closings = prefix.match(/<\/(?:ol|ul)\s*>/gi)?.length ?? 0;

    return openings - closings;
  }

  /**
   * Entrada mais profunda vence (parte → capítulo); em empate de profundidade
   * a primeira vence, pois irmãos costumam apontar para o mesmo arquivo.
   */
  private static keepMoreSpecificLabel(
    candidatesByPath: Map<string, LabelCandidate>,
    path: string,
    candidate: LabelCandidate,
  ): void {
    const current = candidatesByPath.get(path);
    const isMoreSpecific =
      current === undefined || candidate.depth > current.depth;
    if (!isMoreSpecific) return;

    candidatesByPath.set(path, candidate);
  }

  private static toLabelsByPath(
    candidatesByPath: Map<string, LabelCandidate>,
  ): Map<string, string> {
    const labelsByPath = new Map<string, string>();

    for (const [path, candidate] of candidatesByPath) {
      labelsByPath.set(path, candidate.label);
    }

    return labelsByPath;
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
    const entries: NcxNavPointEntry[] = [];

    EpubTableOfContentsReader.collectNavPointEntries(
      navMap.navPoint,
      entries,
      0,
    );

    const orderedPaths: string[] = [];
    const candidatesByPath = new Map<string, LabelCandidate>();

    for (const entry of entries) {
      const path = EpubArchive.resolveHref(ncxPath, entry.source);
      orderedPaths.push(path);

      if (entry.label === null) continue;
      if (path.length === 0) continue;

      EpubTableOfContentsReader.keepMoreSpecificLabel(candidatesByPath, path, {
        label: entry.label,
        depth: entry.depth,
      });
    }

    return {
      orderedPaths,
      excludedPaths: new Set([ncxPath]),
      labelsByPath: EpubTableOfContentsReader.toLabelsByPath(candidatesByPath),
    };
  }

  private static collectNavPointEntries(
    navPoints: unknown,
    entries: NcxNavPointEntry[],
    depth: number,
  ): void {
    for (const navPoint of EpubXml.toArray(navPoints)) {
      const record = EpubXml.toRecord(navPoint);
      const source = EpubXml.readAttribute(record.content, '@_src');
      const navLabel = EpubXml.toRecord(record.navLabel);
      const label = EpubTableOfContentsReader.convertNcxLabel(navLabel.text);

      if (typeof source === 'string') {
        entries.push({ source, label, depth });
      }

      EpubTableOfContentsReader.collectNavPointEntries(
        record.navPoint,
        entries,
        depth + 1,
      );
    }
  }

  private static convertNcxLabel(rawLabel: unknown): string | null {
    const labelText = EpubXml.readText(rawLabel);
    if (labelText === undefined) return null;

    const convertedLabel = HtmlToText.convert(labelText);
    return convertedLabel.length > 0 ? convertedLabel : null;
  }
}
