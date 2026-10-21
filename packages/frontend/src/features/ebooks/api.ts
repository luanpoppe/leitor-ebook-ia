import axios from "axios";
import type { AxiosProgressEvent } from "axios";
import { api } from "@/utils/http";
import type {
  EbookDetail,
  PagedEbooks,
  ReprocessEbookResponse,
  UploadEbookResponse,
  UploadProgress,
} from "./types";

const NETWORK_ERROR_MESSAGE = "Não foi possível falar com o servidor.";
const UNKNOWN_ERROR_MESSAGE = "Ocorreu um erro inesperado. Tente novamente.";

interface ApiErrorBody {
  statusCode?: number;
  message?: string;
  id?: string;
}

interface ApiErrorInfo {
  statusCode: number | null;
  message: string;
  existingBookId: string | null;
}

export async function listEbooks(params: {
  page: number;
  pageSize: number;
}): Promise<PagedEbooks> {
  const response = await api.get<PagedEbooks>("/ebooks", { params });
  return response.data;
}

export async function getEbook(id: string): Promise<EbookDetail> {
  const response = await api.get<EbookDetail>(`/ebooks/${id}`);
  return response.data;
}

export async function uploadEbook(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadEbookResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<UploadEbookResponse>("/ebooks", formData, {
    onUploadProgress: (event) => {
      if (!onProgress) return;
      reportUploadProgress(event, onProgress);
    },
  });

  return response.data;
}

export async function reprocessEbook(
  id: string
): Promise<ReprocessEbookResponse> {
  const response = await api.post<ReprocessEbookResponse>(
    `/ebooks/${id}/reprocess`
  );
  return response.data;
}

export function getApiErrorInfo(error: unknown): ApiErrorInfo {
  const isAxiosError = axios.isAxiosError(error);
  if (!isAxiosError) {
    return {
      statusCode: null,
      message: UNKNOWN_ERROR_MESSAGE,
      existingBookId: null,
    };
  }

  const response = error.response;
  if (!response) {
    return {
      statusCode: null,
      message: NETWORK_ERROR_MESSAGE,
      existingBookId: null,
    };
  }

  const body = response.data;
  const isBodyObject = isApiErrorBody(body);
  if (!isBodyObject) {
    return {
      statusCode: response.status,
      message: UNKNOWN_ERROR_MESSAGE,
      existingBookId: null,
    };
  }

  const statusCode =
    typeof body.statusCode === "number" ? body.statusCode : response.status;
  const bodyMessage = body.message;
  const message =
    typeof bodyMessage === "string" && bodyMessage.trim().length > 0
      ? bodyMessage
      : UNKNOWN_ERROR_MESSAGE;

  return {
    statusCode,
    message,
    existingBookId: typeof body.id === "string" ? body.id : null,
  };
}

export function isNotFoundError(error: unknown): boolean {
  const errorInfo = getApiErrorInfo(error);
  return errorInfo.statusCode === 404;
}

function reportUploadProgress(
  event: AxiosProgressEvent,
  onProgress: (progress: UploadProgress) => void
): void {
  // Sem `total` (ex.: servidor sem Content-Length) o percentual seria NaN, então
  // não há progresso confiável para reportar.
  if (!event.total) return;

  const percent = Math.round((event.loaded * 100) / event.total);
  onProgress({ percent });
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null;
}
