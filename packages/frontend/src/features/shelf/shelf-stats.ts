import type { EbookSummary } from "@/features/ebooks/types";

export interface ShelfStats {
  total: number;
  ready: number;
  active: number;
  failed: number;
}

export class ShelfStatsBuilder {
  static build(ebooks: readonly EbookSummary[], total: number): ShelfStats {
    const ready = ebooks.filter((ebook) => ebook.status === "ready").length;
    const failed = ebooks.filter((ebook) => ebook.status === "failed").length;
    const active = ebooks.filter(
      (ebook) => ebook.status === "pending" || ebook.status === "processing"
    ).length;

    return { total, ready, active, failed };
  }

  // A frase do cabeçalho é a leitura mais rápida do estado da estante: o que
  // pede atenção primeiro, o que está em andamento depois.
  static finding(stats: ShelfStats, isLoading: boolean): string {
    if (isLoading) return "Abrindo a biblioteca...";

    if (stats.failed > 0) {
      return `${stats.failed} ${
        stats.failed === 1 ? "livro precisa" : "livros precisam"
      } de uma nova tentativa; ${stats.ready} já ${
        stats.ready === 1 ? "está pronto" : "estão prontos"
      }.`;
    }

    if (stats.active > 0) {
      return `${stats.active} ${
        stats.active === 1 ? "livro está" : "livros estão"
      } sendo preparados agora.`;
    }

    return `${stats.ready} de ${stats.total} livros prontos para abrir e conversar.`;
  }
}
