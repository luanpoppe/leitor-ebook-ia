// Cada busca traz no máximo 20 mil caracteres (NT-1).
export const WINDOW_SIZE = 20_000;

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
