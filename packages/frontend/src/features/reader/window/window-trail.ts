import type { PageLanding } from "./window-pager";
import {
  WINDOW_SIZE,
  isSamePoint,
  type TextWindow,
  type WindowPoint,
} from "./window-types";

/** Ponto do trecho anterior e onde a virada deve aterrissar nele. */
export interface TrailBackStep {
  point: WindowPoint;
  landing: PageLanding;
}

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
    const currentPoint = this.points[this.index];
    // Viradas rápidas podem pedir o mesmo trecho mais de uma vez; repetir o
    // ponto duplicaria o rastro e faria "voltar" parar no mesmo lugar.
    const isCurrentPoint = isSamePoint(currentPoint, point);
    if (isCurrentPoint) return;

    const visitedBefore = this.points.slice(0, this.index + 1);
    this.points = [...visitedBefore, point];
    this.index = this.points.length - 1;
  }

  /**
   * Ponto do trecho anterior, ou null quando já estamos no primeiro trecho do
   * capítulo. Como o trecho anterior nem sempre foi visitado (abertura no meio
   * do capítulo), estima um ponto uma janela antes.
   */
  back(currentWindow: TextWindow): TrailBackStep | null {
    if (this.index > 0) {
      this.index -= 1;
      return { point: this.points[this.index], landing: { kind: "last" } };
    }

    if (currentWindow.offset === 0) return null;

    const previousOffset = Math.max(0, currentWindow.offset - WINDOW_SIZE);
    const previousPoint = {
      position: currentWindow.position,
      offset: previousOffset,
    };
    this.points = [previousPoint, ...this.points];

    // O trecho estimado pode ter sido grampeado em 0 e terminar depois do
    // offset atual; aterrissar em "last" pularia para frente. Pousar no offset
    // anterior garante a última página que ainda precede a leitura atual.
    return {
      point: previousPoint,
      landing: { kind: "offset", offset: currentWindow.offset - 1 },
    };
  }
}
