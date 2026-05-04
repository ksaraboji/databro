import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parquetWriteBuffer } from 'hyparquet-writer';

const ROOT = process.cwd();
const TOOLS_PAGE_PATH = path.join(ROOT, 'app/tools/page.tsx');
const OUTPUT_DIR = path.join(ROOT, 'public/search');
const JSON_OUTPUT_PATH = path.join(OUTPUT_DIR, 'tool-search-manifest.json');
const CSV_OUTPUT_PATH = path.join(OUTPUT_DIR, 'tool-search-manifest.csv');
const PARQUET_OUTPUT_PATH = path.join(OUTPUT_DIR, 'tool-search-manifest.parquet');
const MANIFEST_VERSION = '1.0.0';

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function tokenize(input) {
  return String(input)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function unique(items) {
  return [...new Set(items)];
}

function makeCsvRow(fields) {
  return fields
    .map((field) => {
      const value = field == null ? '' : String(field);
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    })
    .join(',');
}

function parseToolsPage(content) {
  const lines = content.split(/\r?\n/);
  const records = [];

  let currentCategoryId = '';
  let currentCategoryTitle = '';
  let currentTool = null;

  const idPattern = /^\s*id:\s*"([^"]+)"/;
  const titlePattern = /^\s*title:\s*"([^"]+)"/;
  const namePattern = /^\s*name:\s*"([^"]+)"/;
  const descriptionPattern = /^\s*description:\s*"([^"]+)"/;
  const hrefPattern = /^\s*href:\s*"([^"]+)"/;

  for (const line of lines) {
    const idMatch = line.match(idPattern);
    if (idMatch) {
      currentCategoryId = idMatch[1].trim();
      continue;
    }

    const titleMatch = line.match(titlePattern);
    if (titleMatch) {
      currentCategoryTitle = titleMatch[1].trim();
      continue;
    }

    const nameMatch = line.match(namePattern);
    if (nameMatch) {
      currentTool = {
        toolName: nameMatch[1].trim(),
        description: '',
        href: '',
        categoryId: currentCategoryId,
        categoryTitle: currentCategoryTitle,
      };
      continue;
    }

    if (!currentTool) {
      continue;
    }

    const descriptionMatch = line.match(descriptionPattern);
    if (descriptionMatch) {
      currentTool.description = descriptionMatch[1].trim();
      continue;
    }

    const hrefMatch = line.match(hrefPattern);
    if (hrefMatch) {
      currentTool.href = hrefMatch[1].trim();

      const urlParts = currentTool.href.split('/').filter(Boolean);
      const inferredId = urlParts[urlParts.length - 1] || slugify(currentTool.toolName);
      const keywordSeed = [
        ...tokenize(currentTool.toolName),
        ...tokenize(currentTool.description),
        ...tokenize(currentTool.categoryTitle),
        ...tokenize(inferredId.replace(/-/g, ' ')),
      ];

      const keywords = unique(keywordSeed).sort();
      const record = {
        toolId: inferredId,
        toolName: currentTool.toolName,
        toolUrl: currentTool.href,
        categoryId: currentTool.categoryId,
        categoryTitle: currentTool.categoryTitle,
        description: currentTool.description,
        keywords,
        searchText: [currentTool.toolName, currentTool.categoryTitle, currentTool.description, keywords.join(' ')].join(' ').replace(/\s+/g, ' ').trim(),
        popularityWeight: 1,
        updatedAt: new Date().toISOString(),
      };

      records.push(record);
      currentTool = null;
    }
  }

  return records;
}

function validateRecords(records) {
  const errors = [];
  const seenIds = new Set();

  records.forEach((record, index) => {
    const prefix = `record[${index}]`;

    if (!record.toolId) errors.push(`${prefix}: toolId is required`);
    if (!record.toolName) errors.push(`${prefix}: toolName is required`);
    if (!record.toolUrl || !record.toolUrl.startsWith('/tools/')) {
      errors.push(`${prefix}: toolUrl must start with /tools/`);
    }
    if (!record.categoryId) errors.push(`${prefix}: categoryId is required`);
    if (!record.categoryTitle) errors.push(`${prefix}: categoryTitle is required`);
    if (!record.description) errors.push(`${prefix}: description is required`);
    if (!Array.isArray(record.keywords) || record.keywords.length === 0) {
      errors.push(`${prefix}: keywords must be a non-empty array`);
    }

    if (record.toolId) {
      if (seenIds.has(record.toolId)) {
        errors.push(`${prefix}: duplicate toolId '${record.toolId}'`);
      } else {
        seenIds.add(record.toolId);
      }
    }
  });

  return errors;
}

async function writeOutputs(records) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const manifest = {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'app/tools/page.tsx',
    recordCount: records.length,
    records,
  };

  const header = [
    'tool_id',
    'tool_name',
    'tool_url',
    'category_id',
    'category_title',
    'description',
    'keywords',
    'search_text',
    'popularity_weight',
    'updated_at',
  ];

  const csvRows = [
    makeCsvRow(header),
    ...records.map((record) =>
      makeCsvRow([
        record.toolId,
        record.toolName,
        record.toolUrl,
        record.categoryId,
        record.categoryTitle,
        record.description,
        record.keywords.join(' '),
        record.searchText,
        record.popularityWeight,
        record.updatedAt,
      ])
    ),
  ];

  // Parquet: orient records into column arrays
  const columnData = header.map((colName) => {
    const recordKey = colName.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // snake_case → camelCase
    return {
      name: colName,
      data: records.map((record) => {
        const value = record[recordKey];
        // keywords is an array; flatten to space-separated string for parquet column
        if (Array.isArray(value)) return value.join(' ');
        if (typeof value === 'number') return value;
        return String(value ?? '');
      }),
    };
  });

  const parquetBuffer = Buffer.from(parquetWriteBuffer({ columnData }));

  await fs.writeFile(JSON_OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(CSV_OUTPUT_PATH, `${csvRows.join('\n')}\n`, 'utf8');
  await fs.writeFile(PARQUET_OUTPUT_PATH, parquetBuffer);

  return manifest;
}

async function main() {
  const raw = await fs.readFile(TOOLS_PAGE_PATH, 'utf8');
  const records = parseToolsPage(raw);

  const errors = validateRecords(records);
  if (errors.length > 0) {
    const error = ['Manifest validation failed:', ...errors].join('\n - ');
    throw new Error(error);
  }

  const manifest = await writeOutputs(records);
  console.log(`Wrote ${manifest.recordCount} tool search records.`);
  console.log(`JSON:    ${path.relative(ROOT, JSON_OUTPUT_PATH)}`);
  console.log(`CSV:     ${path.relative(ROOT, CSV_OUTPUT_PATH)}`);
  console.log(`Parquet: ${path.relative(ROOT, PARQUET_OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
