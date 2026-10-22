import type { EbookStatus } from "@/features/ebooks/types";

export type StatusTone = "pending" | "processing" | "ready" | "failed";

const STATUS_LABELS: Record<EbookStatus, string> = {
  pending: "Aguardando",
  processing: "Processando",
  ready: "Pronto",
  failed: "Falhou",
};

export class StatusLabels {
  static label(status: EbookStatus): string {
    return STATUS_LABELS[status];
  }

  static tone(status: EbookStatus): StatusTone {
    return status;
  }

  static isActive(status: EbookStatus): boolean {
    return status === "pending" || status === "processing";
  }
}
