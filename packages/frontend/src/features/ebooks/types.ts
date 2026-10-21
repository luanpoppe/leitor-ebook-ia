export type EbookStatus = "pending" | "processing" | "ready" | "failed";

export type EbookFormat = "epub" | "pdf" | "txt" | "md";

export interface EbookSummary {
  id: string;
  title: string;
  author: string | null;
  format: EbookFormat;
  status: EbookStatus;
  createdAt: string;
  coverUrl: string | null;
}

export interface EbookDetail extends EbookSummary {
  size: number;
  errorMessage: string | null;
}

export interface PagedEbooks {
  items: EbookSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UploadEbookResponse {
  id: string;
  status: EbookStatus;
  title: string;
}

export interface ReprocessEbookResponse {
  id: string;
  status: EbookStatus;
}

export interface UploadProgress {
  percent: number;
}
