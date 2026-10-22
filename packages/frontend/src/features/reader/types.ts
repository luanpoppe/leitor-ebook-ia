export interface ChapterSummary {
  id: string;
  position: number;
  title: string | null;
  wordCount: number;
}

export interface ChapterListResponse {
  items: ChapterSummary[];
}

export interface ChapterPage {
  id: string;
  position: number;
  title: string | null;
  text: string;
  offset: number;
  limit: number;
  nextOffset: number | null;
  totalLength: number;
  previousPosition: number | null;
  nextPosition: number | null;
}

export interface ReadingProgress {
  bookId: string;
  chapterPosition: number;
  offset: number;
  updatedAt: string;
}

export interface SaveReadingProgressInput {
  chapterPosition: number;
  offset: number;
}
