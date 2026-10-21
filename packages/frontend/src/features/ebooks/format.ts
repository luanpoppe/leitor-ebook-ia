import type { EbookFormat } from "./types";

const INVALID_VALUE_LABEL = "—";

const READABLE_UNITS = ["B", "KB", "MB", "GB"] as const;
const UNIT_BASE = 1024;
const LAST_UNIT_INDEX = READABLE_UNITS.length - 1;
const BYTES_UNIT_INDEX = 0;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

export function formatDate(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return INVALID_VALUE_LABEL;

  return dateFormatter.format(timestamp);
}

export function formatBytes(bytes: number): string {
  const isInvalidSize = !Number.isFinite(bytes) || bytes < 0;
  if (isInvalidSize) return INVALID_VALUE_LABEL;

  const unitIndex = pickReadableUnitIndex(bytes);
  const unitLabel = READABLE_UNITS[unitIndex];

  if (unitIndex === BYTES_UNIT_INDEX) {
    return `${Math.round(bytes)} ${unitLabel}`;
  }

  const value = bytes / UNIT_BASE ** unitIndex;
  const formattedValue = decimalFormatter.format(value);

  return `${formattedValue} ${unitLabel}`;
}

export function formatExtension(format: EbookFormat): string {
  return format.toUpperCase();
}

function pickReadableUnitIndex(bytes: number): number {
  let unitIndex = BYTES_UNIT_INDEX;
  let nextUnitThreshold = UNIT_BASE;

  while (bytes >= nextUnitThreshold && unitIndex < LAST_UNIT_INDEX) {
    unitIndex += 1;
    nextUnitThreshold *= UNIT_BASE;
  }

  return unitIndex;
}
