import type { EbookFormat } from "./types";

const MEGABYTE_IN_BYTES = 1024 * 1024;

export const MAX_UPLOAD_BYTES = 50 * MEGABYTE_IN_BYTES;

export const MAX_UPLOAD_LABEL = "50 MB";

export const ACCEPTED_EXTENSIONS = [
  "epub",
  "pdf",
  "txt",
  "md",
] as const satisfies readonly EbookFormat[];

const extensionSelectors = ACCEPTED_EXTENSIONS.map(
  (extension) => `.${extension}`
);

export const ACCEPT_ATTRIBUTE = extensionSelectors.join(",");

export const DEFAULT_PAGE_SIZE = 20;

export const SUPPORTED_FORMATS_LABEL = "EPUB, PDF, TXT ou MD";
