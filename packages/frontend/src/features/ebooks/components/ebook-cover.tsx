"use client";

import { useState } from "react";

interface EbookCoverProps {
  title: string;
  coverUrl: string | null;
  className?: string;
}

const FRAME_CLASS_NAME =
  "aspect-[2/3] w-full overflow-hidden rounded-md border";

export function EbookCover({ title, coverUrl, className }: EbookCoverProps) {
  // Guarda qual URL falhou, em vez de um booleano: quando a URL muda, a
  // comparação abaixo deixa de casar e a imagem volta a ser tentada sozinha.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const isCoverBroken = coverUrl !== null && failedUrl === coverUrl;
  const shouldShowPlaceholder = !coverUrl || isCoverBroken;

  const frameClassNames = [FRAME_CLASS_NAME, className]
    .filter(Boolean)
    .join(" ");

  if (shouldShowPlaceholder) {
    const placeholderClassNames = [
      frameClassNames,
      "flex items-center justify-center border-dashed border-neutral-300 bg-neutral-100",
    ].join(" ");

    return (
      <div className={placeholderClassNames}>
        <span className="line-clamp-4 px-2 text-center text-xs font-medium text-neutral-500">
          {title}
        </span>
      </div>
    );
  }

  const handleImageError = () => setFailedUrl(coverUrl);

  return (
    <div className={frameClassNames}>
      {/* A URL é pré-assinada e vem de host variável, então next/image exigiria
          remotePatterns por host e ainda quebraria com o cache da URL expirada. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverUrl}
        alt={`Capa de ${title}`}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={handleImageError}
      />
    </div>
  );
}
