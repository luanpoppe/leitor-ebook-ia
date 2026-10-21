import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const FIRST_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const listEbooksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(FIRST_PAGE),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export class ListEbooksQueryDto extends createZodDto(listEbooksQuerySchema) {}

export interface EbookSummary {
  id: string;
  title: string;
  author: string | null;
  format: string;
  status: string;
  createdAt: string;
}

export interface EbookDetail extends EbookSummary {
  size: number;
  errorMessage: string | null;
  coverUrl: string | null;
}

export interface PagedEbooks {
  items: EbookSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UploadEbookResponse {
  id: string;
  status: string;
  title: string;
}

export interface ReprocessEbookResponse {
  id: string;
  status: string;
}
