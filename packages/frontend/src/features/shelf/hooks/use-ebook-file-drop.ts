"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from "react";
import { UploadFileValidator } from "@/features/ebooks/upload-file-validator";
import { ACCEPT_ATTRIBUTE } from "@/features/ebooks/constants";
import { useUploadEbook } from "@/features/ebooks/use-upload-ebook";

interface UseEbookFileDropOptions {
  onDuplicate?: (existingBookId: string) => void;
}

export interface UseEbookFileDropResult {
  isDragging: boolean;
  isUploading: boolean;
  progress: number;
  localError: string | null;
  serverError: string | null;
  openPicker: () => void;
  rootProps: {
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
    onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
    role: "button";
    tabIndex: number;
    "aria-disabled": boolean;
    "aria-label": string;
  };
  inputProps: {
    ref: RefObject<HTMLInputElement | null>;
    type: "file";
    accept: string;
    hidden: true;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  };
}

// Comportamento da área de envio: validação local, arrastar-e-soltar,
// progresso e duplicata vivem aqui; a tela só desenha a caixa.
export function useEbookFileDrop(
  options: UseEbookFileDropOptions = {}
): UseEbookFileDropResult {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { upload, progress, isUploading, errorInfo } = useUploadEbook({
    onDuplicate: options.onDuplicate,
  });

  const handleFile = (file: File): void => {
    const validationError = UploadFileValidator.validate(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    upload(file);
  };

  const openPicker = (): void => {
    if (isUploading) return;
    inputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const isActivationKey = event.key === "Enter" || event.key === " ";
    if (!isActivationKey) return;

    event.preventDefault();
    openPicker();
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

  return {
    isDragging,
    isUploading,
    progress,
    localError,
    serverError: errorInfo?.message ?? null,
    openPicker,
    rootProps: {
      onClick: openPicker,
      onKeyDown: handleKeyDown,
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: () => setIsDragging(false),
      onDrop: handleDrop,
      role: "button",
      tabIndex: 0,
      "aria-disabled": isUploading,
      "aria-label": "Enviar ebook",
    },
    inputProps: {
      ref: inputRef,
      type: "file",
      accept: ACCEPT_ATTRIBUTE,
      hidden: true,
      onChange: handleInputChange,
    },
  };
}
