import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pipeline, env } from '@xenova/transformers';

const ROOT = process.cwd();
const RAG_KB_PATH = path.join(ROOT, 'components/ai-chat/rag-kb.ts');
const KB_MARKDOWN_PATH = path.join(ROOT, 'public/ai-chat/knowledge-base.md');
const OUTPUT_PATH = path.join(ROOT, 'public/ai-chat/knowledge-base-vectors.json');

function extractConst(content, name) {
  const pattern = new RegExp(`export const ${name} = ['\"]([^'\"]+)['\"]`);
  const match = content.match(pattern);
  return match ? match[1] : null;
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function uniqueWords(words) {
  const seen = new Set();
  const out = [];
  for (const word of words) {
    const normalized = String(word || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function parseMarkdownSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let currentTitle = '';
  let currentBody = [];

  const flush = () => {
    if (!currentTitle) return;

    const rawBody = currentBody.join('\n').trim();
    if (!rawBody) {
      currentTitle = '';
      currentBody = [];
      return;
    }

    const rawLines = rawBody.split('\n');
    const firstLine = (rawLines[0] || '').trim();
    let tags = [];
    let contentLines = rawLines;

    const tagsMatch = firstLine.match(/^tags:\s*(.+)$/i);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      contentLines = rawLines.slice(1);
    }

    const body = contentLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (body) {
      sections.push({ title: currentTitle, tags, body });
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

function splitWithOverlap(text, chunkSize, overlap) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const segments = [];
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

    if (end >= cleaned.length) break;

    const nextStart = Math.max(0, end - overlap);
    start = nextStart <= start ? end : nextStart;
  }

  return segments;
}

function buildChunks(markdown, kbVersion, source, chunkSize, overlap) {
  const sections = parseMarkdownSections(markdown);
  const chunks = [];

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

async function main() {
  const ragKbSource = await fs.readFile(RAG_KB_PATH, 'utf8');
  const kbVersion = extractConst(ragKbSource, 'KB_VERSION');
  const embeddingModel = extractConst(ragKbSource, 'KB_EMBEDDING_MODEL');

  if (!kbVersion || !embeddingModel) {
    throw new Error('Unable to extract KB_VERSION or KB_EMBEDDING_MODEL from components/ai-chat/rag-kb.ts');
  }

  const markdown = await fs.readFile(KB_MARKDOWN_PATH, 'utf8');

  const chunkSize = 520;
  const overlap = 100;
  const chunks = buildChunks(markdown, kbVersion, 'public/ai-chat/knowledge-base.md', chunkSize, overlap);

  if (chunks.length === 0) {
    throw new Error('No chunks generated from markdown knowledge base.');
  }

  env.allowLocalModels = false;
  env.useBrowserCache = false;

  console.log(`Generating embeddings for ${chunks.length} chunks using ${embeddingModel}...`);
  const embedder = await pipeline('feature-extraction', embeddingModel);

  let dimensions = 0;
  const vectorChunks = [];

  for (const chunk of chunks) {
    const textForEmbedding = `${chunk.keywords.join(' ')}. ${chunk.text}`;
    const output = await embedder(textForEmbedding, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);
    dimensions = dimensions || embedding.length;

    vectorChunks.push({
      ...chunk,
      embedding,
    });
  }

  const artifact = {
    header: {
      kbVersion,
      embeddingModel,
      generatedAt: new Date().toISOString(),
      source: 'public/ai-chat/knowledge-base.md',
      chunkSize,
      overlap,
      dimensions,
    },
    chunks: vectorChunks,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(artifact), 'utf8');
  console.log(`Wrote vector artifact: ${OUTPUT_PATH}`);
  console.log(`Header: kbVersion=${kbVersion}, embeddingModel=${embeddingModel}, dimensions=${dimensions}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
