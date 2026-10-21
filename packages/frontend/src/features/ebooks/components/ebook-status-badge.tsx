import type { EbookStatus } from "../types";

interface EbookStatusBadgeProps {
  status: EbookStatus;
  className?: string;
}

interface StatusAppearance {
  label: string;
  className: string;
}

const BASE_CLASS_NAME = "rounded-full px-2 py-0.5 text-xs font-medium";

const STATUS_APPEARANCES: Record<EbookStatus, StatusAppearance> = {
  pending: { label: "Aguardando", className: "bg-amber-100 text-amber-800" },
  processing: { label: "Processando", className: "bg-blue-100 text-blue-800" },
  ready: { label: "Pronto", className: "bg-green-100 text-green-800" },
  failed: { label: "Falhou", className: "bg-red-100 text-red-800" },
};

export function EbookStatusBadge({
  status,
  className,
}: EbookStatusBadgeProps) {
  const appearance = STATUS_APPEARANCES[status];
  const classNames = [BASE_CLASS_NAME, appearance.className, className]
    .filter(Boolean)
    .join(" ");

  return <span className={classNames}>{appearance.label}</span>;
}
