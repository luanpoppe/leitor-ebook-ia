import { XMLParser } from 'fast-xml-parser';
import { ContentExtractionError } from '../content.types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

/**
 * Acesso tolerante à árvore que o `fast-xml-parser` devolve.
 * O mesmo caminho do XML pode vir como objeto único ou como lista, e o valor
 * de um elemento pode ser texto puro ou um objeto com o atributo `#text`.
 */
export class EpubXml {
  static parse(xml: string): Record<string, unknown> {
    try {
      return EpubXml.toRecord(parser.parse(xml));
    } catch {
      throw new ContentExtractionError(
        'EPUB inválido: um dos arquivos de configuração está malformado.',
      );
    }
  }

  static toRecord(value: unknown): Record<string, unknown> {
    const isRecord = typeof value === 'object' && value !== null;

    return isRecord ? (value as Record<string, unknown>) : {};
  }

  static toArray(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];

    return Array.isArray(value) ? value : [value];
  }

  static readAttribute(value: unknown, attributeName: string): string | undefined {
    const attribute = EpubXml.toRecord(value)[attributeName];

    return typeof attribute === 'string' ? attribute : undefined;
  }

  static readText(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number') return String(value);

    const text = EpubXml.readAttribute(value, '#text');
    return text?.trim() || undefined;
  }
}
