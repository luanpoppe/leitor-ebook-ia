"use client";

import { useState } from "react";
import { TitleInitials } from "../title-initials";
import type { EbookFormat } from "@/features/ebooks/types";
import { formatExtension } from "@/features/ebooks/format";
import styles from "./book-cover.module.css";

export type CoverVariant = "card" | "lead" | "rail" | "detail";

interface BookCoverProps {
  title: string;
  coverUrl: string | null;
  format: EbookFormat;
  variant?: CoverVariant;
}

const VARIANT_CLASS_NAMES: Record<CoverVariant, string> = {
  card: styles.card,
  lead: styles.lead,
  rail: styles.rail,
  detail: styles.detail,
};

export function BookCover({
  title,
  coverUrl,
  format,
  variant = "card",
}: BookCoverProps) {
  // Guarda a URL que falhou: quando a URL muda, a comparação deixa de casar e
  // a imagem volta a ser tentada sozinha.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const isCoverBroken = coverUrl !== null && failedUrl === coverUrl;
  const shouldShowPlaceholder = !coverUrl || isCoverBroken;
  const variantClassName = VARIANT_CLASS_NAMES[variant];

  if (shouldShowPlaceholder) {
    const isRail = variant === "rail";
    const placeholderClassName = [
      styles.frame,
      variantClassName,
      styles.placeholder,
    ].join(" ");

    return (
      <div
        className={placeholderClassName}
        role="img"
        aria-label={`Capa de ${title}`}
      >
        <span className={styles.title}>
          {isRail ? TitleInitials.of(title) : title}
        </span>
        {!isRail && (
          <span className={styles.footnote}>
            {formatExtension(format)}
          </span>
        )}
      </div>
    );
  }

  const handleImageError = () => setFailedUrl(coverUrl);

  return (
    <div className={`${styles.frame} ${variantClassName}`}>
      {/* URL pré-assinada de host variável: next/image exigiria remotePatterns
          e quebraria com o cache de uma URL expirada. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverUrl}
        alt={`Capa de ${title}`}
        loading={variant === "card" ? "lazy" : "eager"}
        onError={handleImageError}
      />
    </div>
  );
}
