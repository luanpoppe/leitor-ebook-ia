"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  SUPPORTED_FORMATS_LABEL,
} from "../constants";
import { useUploadEbook } from "../use-upload-ebook";

interface UploadDropzoneProps {
  onDuplicate?: (existingBookId: string) => void;
  className?: string;
}

const DROPZONE_BASE_CLASS_NAME =
  "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 bg-white px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

const DROPZONE_IDLE_CLASS_NAME =
  "cursor-pointer hover:border-blue-400 hover:bg-blue-50";

const DROPZONE_DRAGGING_CLASS_NAME = "border-blue-500 bg-blue-50";

const DROPZONE_BUSY_CLASS_NAME = "cursor-not-allowed opacity-60";

const DROP_TITLE = "Arraste seu ebook aqui";

const DROP_HINT = `ou clique para escolher — ${SUPPORTED_FORMATS_LABEL}, até ${MAX_UPLOAD_LABEL}`;

export function UploadDropzone({
  onDuplicate,
  className,
}: UploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { upload, progress, isUploading, errorInfo } = useUploadEbook({
    onDuplicate,
  });

  const handleFile = (file: File): void => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const isExtensionAccepted = ACCEPTED_EXTENSIONS.some(
      (accepted) => accepted === extension
    );

    if (!isExtensionAccepted) {
      const message = `Formato não suportado. Envie ${SUPPORTED_FORMATS_LABEL}.`;
      setLocalError(message);
      return;
    }

    const isOverSizeLimit = file.size > MAX_UPLOAD_BYTES;
    if (isOverSizeLimit) {
      const message = `O arquivo excede o limite de ${MAX_UPLOAD_LABEL}.`;
      setLocalError(message);
      return;
    }

    setLocalError(null);
    upload(file);
  };

  const openFilePicker = (): void => {
    if (isUploading) return;

    const input = fileInputRef.current;
    if (!input) return;

    input.click();
  };

  const handleDropzoneClick = (): void => {
    openFilePicker();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const isActivationKey = event.key === "Enter" || event.key === " ";
    if (!isActivationKey) return;

    event.preventDefault();
    openFilePicker();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (isUploading) return;

    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    // Sem preventDefault o navegador abre o arquivo em vez de soltar na área.
    event.preventDefault();
    if (isUploading) return;

    setIsDragging(true);
  };

  const handleDragLeave = (): void => {
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);

    if (isUploading) return;

    const file = event.dataTransfer.files[0];
    if (!file) return;

    handleFile(file);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // Zera o input para que escolher o mesmo arquivo de novo dispare o evento.
    event.target.value = "";

    if (!file) return;

    handleFile(file);
  };

  const dropzoneClassNames = [
    DROPZONE_BASE_CLASS_NAME,
    isUploading
      ? DROPZONE_BUSY_CLASS_NAME
      : DROPZONE_IDLE_CLASS_NAME,
    isDragging && !isUploading ? DROPZONE_DRAGGING_CLASS_NAME : null,
  ]
    .filter(Boolean)
    .join(" ");

  const rootClassNames = ["w-full", className].filter(Boolean).join(" ");

  return (
    <div className={rootClassNames}>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={isUploading}
        aria-label="Enviar ebook"
        onClick={handleDropzoneClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={dropzoneClassNames}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          hidden
          onChange={handleInputChange}
        />

        <p className="pointer-events-none text-sm font-semibold text-neutral-900">
          {DROP_TITLE}
        </p>
        <p className="pointer-events-none text-xs text-neutral-500">
          {DROP_HINT}
        </p>
      </div>

      {isUploading && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso do envio"
            className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
          >
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-neutral-600">{progress}% enviado</p>
        </div>
      )}

      {localError && (
        <p className="mt-2 text-sm text-red-700">{localError}</p>
      )}

      {errorInfo && (
        <p className="mt-2 text-sm text-red-700">{errorInfo.message}</p>
      )}
    </div>
  );
}
