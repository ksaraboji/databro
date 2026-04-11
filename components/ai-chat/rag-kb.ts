import { KNOWLEDGE_BASE } from './knowledge-base';

export interface RAGChunkMetadata {
  kbVersion: string;
  source: string;
  section: string;
  tags: string[];
  chunkIndex: number;
  charStart: number;
  charEnd: number;
}

export interface RAGChunk {
  id: string;
  keywords: string[];
  text: string;
  metadata: RAGChunkMetadata;
}

interface MarkdownSection {
  title: string;
  tags: string[];
  body: string;
}

interface ChunkOptions {
  source?: string;
  chunkSize?: number;
  overlap?: number;
  kbVersion?: string;
}

const DEFAULT_SOURCE = 'public/ai-chat/knowledge-base.md';
const DEFAULT_CHUNK_SIZE = 520;
const DEFAULT_OVERLAP = 100;
export const KB_VERSION = '2026-04-11.1';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function uniqueWords(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const word of words) {
    const normalized = word.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  const flush = () => {
    if (!currentTitle) {
      return;
    }

    const rawBody = currentBody.join('\n').trim();
    if (!rawBody) {
      currentTitle = '';
      currentBody = [];
      return;
    }

    const rawLines = rawBody.split('\n');
    const firstLine = rawLines[0]?.trim() || '';
    let tags: string[] = [];
    let contentLines = rawLines;

    const tagsMatch = firstLine.match(/^tags:\s*(.+)$/i);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      contentLines = rawLines.slice(1);
    }

    const body = contentLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (body) {
      sections.push({
        title: currentTitle,
        tags,
        body,
      });
    }

    currentTitle = '';
    currentBody = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1].trim();
      continue;
    }

    if (currentTitle) {
      currentBody.push(line);
    }
  }

  flush();
  return sections;
}

function splitWithOverlap(text: string, chunkSize: number, overlap: number): Array<{ text: string; start: number; end: number }> {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return [];
  }

  const segments: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;

  while (start < cleaned.length) {
    const maxEnd = Math.min(start + chunkSize, cleaned.length);
    let end = maxEnd;

    if (maxEnd < cleaned.length) {
      const minBreak = Math.floor(start + chunkSize * 0.6);
      const searchWindow = cleaned.slice(minBreak, maxEnd);
      const breakOffset = Math.max(
        searchWindow.lastIndexOf('. '),
        searchWindow.lastIndexOf('; '),
        searchWindow.lastIndexOf(', '),
        searchWindow.lastIndexOf(' '),
      );

      if (breakOffset > 0) {
        end = minBreak + breakOffset + 1;
      }
    }

    const piece = cleaned.slice(start, end).trim();
    if (piece) {
      segments.push({ text: piece, start, end });
    }

    if (end >= cleaned.length) {
      break;
    }

    const nextStart = Math.max(0, end - overlap);
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
  }

  return segments;
}

export function buildRAGContextFromMarkdown(markdown: string, options: ChunkOptions = {}): RAGChunk[] {
  const source = options.source || DEFAULT_SOURCE;
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap || DEFAULT_OVERLAP;
  const kbVersion = options.kbVersion || KB_VERSION;

  const sections = parseMarkdownSections(markdown);
  const chunks: RAGChunk[] = [];

  for (const section of sections) {
    const sectionSlug = slugify(section.title);
    const headingKeywords = section.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2);

    const textChunks = splitWithOverlap(section.body, chunkSize, overlap);

    textChunks.forEach((piece, index) => {
      const id = index === 0 ? sectionSlug : `${sectionSlug}-${index + 1}`;
      const keywords = uniqueWords([...section.tags, ...headingKeywords]);

      chunks.push({
        id,
        keywords,
        text: piece.text,
        metadata: {
          kbVersion,
          source,
          section: section.title,
          tags: section.tags,
          chunkIndex: index,
          charStart: piece.start,
          charEnd: piece.end,
        },
      });
    });
  }

  return chunks;
}

export function buildCitationPreviewMap(chunks: Array<{ id: string; text: string }>): Record<string, string> {
  return Object.fromEntries(
    chunks.map((chunk) => [
      chunk.id,
      chunk.text.length > 180 ? `${chunk.text.slice(0, 180)}...` : chunk.text,
    ]),
  );
}

export const FALLBACK_RAG_CHUNKS: RAGChunk[] = KNOWLEDGE_BASE.map((chunk, index) => ({
  id: chunk.id,
  keywords: chunk.keywords,
  text: chunk.text,
  metadata: {
    kbVersion: KB_VERSION,
    source: 'components/ai-chat/knowledge-base.ts',
    section: chunk.id,
    tags: chunk.keywords,
    chunkIndex: index,
    charStart: 0,
    charEnd: chunk.text.length,
  },
}));
