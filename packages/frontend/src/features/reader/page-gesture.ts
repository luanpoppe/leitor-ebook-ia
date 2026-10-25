/** Deslocamento mínimo, em px, para o arrasto virar página. */
export const SWIPE_THRESHOLD_PX = 60;
/** Deslocamento abaixo disso ainda é um toque parado. */
export const TAP_MAX_TRAVEL_PX = 10;

const LEFT_ZONE_RATIO = 0.25;
const RIGHT_ZONE_RATIO = 0.75;

export type PageTurnIntent = "next" | "previous" | "open-toc" | null;

export class PageGesture {
  /** Arrasto horizontal vira página; vertical ou curto não vira. */
  static resolveSwipe(dx: number, dy: number): "next" | "previous" | null {
    const isLongEnough = Math.abs(dx) >= SWIPE_THRESHOLD_PX;
    const isMostlyHorizontal = Math.abs(dx) > Math.abs(dy);
    if (!isLongEnough || !isMostlyHorizontal) return null;

    // Arrastar para a esquerda puxa o que vem depois.
    return dx < 0 ? "next" : "previous";
  }

  /** Toque parado resolvido pelas faixas de largura (25% / 50% / 25%). */
  static resolveTap(x: number, viewportWidth: number): PageTurnIntent {
    if (viewportWidth <= 0) return null;

    const leftZoneEnd = viewportWidth * LEFT_ZONE_RATIO;
    const rightZoneStart = viewportWidth * RIGHT_ZONE_RATIO;

    if (x < leftZoneEnd) return "previous";
    if (x > rightZoneStart) return "next";

    return "open-toc";
  }
}
