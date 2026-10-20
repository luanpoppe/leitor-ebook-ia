const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  middot: '·',
  bull: '•',
  aacute: 'á',
  acirc: 'â',
  agrave: 'à',
  atilde: 'ã',
  auml: 'ä',
  ccedil: 'ç',
  eacute: 'é',
  ecirc: 'ê',
  egrave: 'è',
  euml: 'ë',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  oacute: 'ó',
  ocirc: 'ô',
  ograve: 'ò',
  otilde: 'õ',
  ouml: 'ö',
  uacute: 'ú',
  ucirc: 'û',
  ugrave: 'ù',
  uuml: 'ü',
  Aacute: 'Á',
  Acirc: 'Â',
  Agrave: 'À',
  Atilde: 'Ã',
  Auml: 'Ä',
  Ccedil: 'Ç',
  Eacute: 'É',
  Ecirc: 'Ê',
  Iacute: 'Í',
  Ntilde: 'Ñ',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  Uacute: 'Ú',
  Uuml: 'Ü',
};

/**
 * Converte o XHTML de um capítulo em texto puro.
 * Blocos viram quebras de linha para o `TextNormalizer` conseguir separar
 * parágrafos depois; `head`, `script` e `style` não são conteúdo do livro.
 */
export class HtmlToText {
  static convert(html: string): string {
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
    const withoutHead = withoutComments.replace(
      /<head[\s\S]*?<\/head>/gi,
      ' ',
    );
    const withoutScripts = withoutHead.replace(
      /<(script|style)[\s\S]*?<\/\1>/gi,
      ' ',
    );
    const withLineBreaks = withoutScripts
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(
        /<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi,
        '\n\n',
      );
    const withoutTags = withLineBreaks.replace(/<[^>]+>/g, ' ');

    return HtmlToText.decodeEntities(withoutTags).trim();
  }

  private static decodeEntities(text: string): string {
    return text.replace(
      /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi,
      (match, entity: string) => {
        if (entity.startsWith('#')) {
          return HtmlToText.decodeNumericEntity(entity, match);
        }

        return (
          NAMED_HTML_ENTITIES[entity] ??
          NAMED_HTML_ENTITIES[entity.toLowerCase()] ??
          match
        );
      },
    );
  }

  private static decodeNumericEntity(
    entity: string,
    fallback: string,
  ): string {
    const isHexadecimal = entity[1]?.toLowerCase() === 'x';
    const digits = isHexadecimal ? entity.slice(2) : entity.slice(1);
    const codePoint = Number.parseInt(digits, isHexadecimal ? 16 : 10);
    const isValidCodePoint =
      Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff;

    return isValidCodePoint ? String.fromCodePoint(codePoint) : fallback;
  }
}
