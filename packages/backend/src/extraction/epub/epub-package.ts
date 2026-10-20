import { ContentExtractionError } from '../content.types';
import { EpubArchive } from './epub-archive';
import { EpubXml } from './epub-xml';

const CONTAINER_ENTRY_PATH = 'META-INF/container.xml';
const OPF_MEDIA_TYPE = 'application/oebps-package+xml';

export interface EpubManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
}

export interface EpubPackageDocument {
  packagePath: string;
  title?: string;
  author?: string;
  coverId?: string;
  tocId?: string;
  manifestById: Map<string, EpubManifestItem>;
  manifestItems: EpubManifestItem[];
  spineIds: string[];
}

/**
 * Lê o `container.xml` e o OPF (o pacote do EPUB) e expõe o que o resto do
 * parser precisa: metadados, manifest e a ordem do spine.
 */
export class EpubPackageReader {
  static read(archive: EpubArchive): EpubPackageDocument {
    const packagePath = EpubPackageReader.readPackagePath(archive);
    const packageData = EpubPackageReader.readPackageData(
      archive,
      packagePath,
    );
    const metadata = EpubXml.toRecord(packageData.metadata);
    const manifest = EpubXml.toRecord(packageData.manifest);
    const spine = EpubXml.toRecord(packageData.spine);
    const manifestItems = EpubXml.toArray(manifest.item)
      .map((item) => EpubPackageReader.readManifestItem(item))
      .filter((item) => item.id.length > 0 && item.href.length > 0);

    return {
      packagePath,
      title: EpubXml.readText(EpubXml.toArray(metadata.title)[0]),
      author: EpubXml.readText(EpubXml.toArray(metadata.creator)[0]),
      coverId: EpubPackageReader.readCoverId(metadata),
      tocId: EpubXml.readAttribute(spine, '@_toc'),
      manifestById: new Map(manifestItems.map((item) => [item.id, item])),
      manifestItems,
      spineIds: EpubXml.toArray(spine.itemref)
        .map((itemref) => EpubXml.readAttribute(itemref, '@_idref'))
        .filter((id): id is string => typeof id === 'string'),
    };
  }

  private static readPackagePath(archive: EpubArchive): string {
    const containerXml = archive.readText(CONTAINER_ENTRY_PATH);
    const container = EpubXml.parse(containerXml);
    const containerRecord = EpubXml.toRecord(container.container);
    const rootfilesRecord = EpubXml.toRecord(containerRecord.rootfiles);
    const rootfiles = EpubXml.toArray(rootfilesRecord.rootfile);

    const rootfile =
      rootfiles.find(
        (file) => EpubXml.toRecord(file)['@_media-type'] === OPF_MEDIA_TYPE,
      ) ?? rootfiles[0];
    const packagePath = EpubXml.toRecord(rootfile)['@_full-path'];

    if (typeof packagePath !== 'string' || packagePath.length === 0) {
      throw new ContentExtractionError(
        'EPUB inválido: o arquivo de pacote (OPF) não foi encontrado.',
      );
    }

    return packagePath;
  }

  private static readPackageData(
    archive: EpubArchive,
    packagePath: string,
  ): Record<string, unknown> {
    const packageXml = archive.readText(packagePath);

    return EpubXml.toRecord(EpubXml.parse(packageXml).package);
  }

  private static readManifestItem(item: unknown): EpubManifestItem {
    const record = EpubXml.toRecord(item);

    return {
      id: EpubXml.readAttribute(record, '@_id') ?? '',
      href: EpubXml.readAttribute(record, '@_href') ?? '',
      mediaType: EpubXml.readAttribute(record, '@_media-type') ?? '',
      properties: (EpubXml.readAttribute(record, '@_properties') ?? '')
        .split(/\s+/)
        .filter(Boolean),
    };
  }

  private static readCoverId(
    metadata: Record<string, unknown>,
  ): string | undefined {
    for (const meta of EpubXml.toArray(metadata.meta)) {
      const record = EpubXml.toRecord(meta);
      const isCover = EpubXml.readAttribute(record, '@_name') === 'cover';

      if (!isCover) continue;

      return EpubXml.readAttribute(record, '@_content');
    }

    return undefined;
  }
}
