import { WINDOW_SIZE, type TextWindow, type WindowPoint } from "./window-types";

/**
 * Rastro dos trechos visitados no capítulo. Avançar descarta o que estava à
 * frente; voltar reaproveita o ponto anterior — que normalmente ainda está na
 * memória de janelas, então voltar página não custa requisição.
 */
export class WindowTrail {
  private points: WindowPoint[];
  private index: number;

  constructor(start: WindowPoint) {
    this.points = [start];
    this.index = 0;
  }

  /** Recomeça o rastro (abertura de capítulo, retomada no offset salvo). */
  reset(start: WindowPoint): void {
    this.points = [start];
    this.index = 0;
  }

  /** Marca o trecho seguinte como atual, descartando o que vinha depois dele. */
  advance(point: WindowPoint): void {
    const visitedBefore = this.points.slice(0, this.index + 1);
    this.points = [...visitedBefore, point];
    this.index = this.points.length - 1;
  }

  /**
   * Ponto do trecho anterior, ou null quando já estamos no primeiro trecho do
   * capítulo. Como o trecho anterior nem sempre foi visitado (abertura no meio
   * do capítulo), estima um ponto uma janela antes.
   */
  back(currentWindow: TextWindow): WindowPoint | null {
    if (this.index > 0) {
      this.index -= 1;
      return this.points[this.index];
    }

    if (currentWindow.offset === 0) return null;

    const previousOffset = Math.max(0, currentWindow.offset - WINDOW_SIZE);
    const previousPoint = {
      position: currentWindow.position,
      offset: previousOffset,
    };
    this.points = [previousPoint, ...this.points];
    return previousPoint;
  }
}
