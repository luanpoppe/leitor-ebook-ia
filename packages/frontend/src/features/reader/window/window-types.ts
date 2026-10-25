// Cada busca traz no máximo 20 mil caracteres (NT-1).
export const WINDOW_SIZE = 20_000;

// Quanto texto fica antes do offset de abertura. Precisa ser bem menor que a
// janela: o offset pedido tem que cair dentro do trecho buscado, senão a
// paginação não acha a página e abre no começo (ou no fim) da janela.
export const WINDOW_BACKTRACK = 4_000;

export interface TextWindow {
  position: number;
  offset: number;
  text: string;
  nextOffset: number | null;
  totalLength: number;
}

export interface WindowPoint {
  position: number;
  offset: number;
}

export function toWindowKey(point: WindowPoint): string {
  return `${point.position}:${point.offset}`;
}

export function isSamePoint(left: WindowPoint, right: WindowPoint): boolean {
  return left.position === right.position && left.offset === right.offset;
}
