export class ShortTitle {
  // Títulos de EPUB vêm completos ("Da terra à lua, viagem directa em 97
  // horas..."). No destaque, o nome curto cabe em duas linhas; o título
  // inteiro continua na ficha e no detalhe.
  static of(title: string): string {
    const [beforeColon] = title.split(":");
    const [beforeComma] = beforeColon.split(",");
    const shortTitle = beforeComma.trim();

    return shortTitle.length > 0 ? shortTitle : title;
  }
}
