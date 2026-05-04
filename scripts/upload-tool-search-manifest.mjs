/**
 * Upload tool search manifest artifacts to AWS S3.
 *
 * Prerequisites:
 *   - Run `npm run build:tool-search-manifest` first to generate artifacts.
 *   - Set the following environment variables (or use an AWS profile):
 *       TOOL_SEARCH_S3_BUCKET   — target S3 bucket name
 *       TOOL_SEARCH_S3_PREFIX   — key prefix, e.g. "search/" (default: "search/")
 *       TOOL_SEARCH_UPLOAD_FILES — comma-separated list: parquet,csv,json
 *                                 (default: "parquet,csv,json")
 *       AWS_REGION              — AWS region, e.g. "us-east-1"
 *       AWS_ACCESS_KEY_ID       — optional if using an instance/profile credential
 *       AWS_SECRET_ACCESS_KEY   — optional if using an instance/profile credential
 *
 * Usage:
 *   npm run upload:tool-search-manifest
 *   TOOL_SEARCH_UPLOAD_FILES=parquet,csv npm run upload:tool-search-manifest
 *
 * The script uploads:
 *   public/search/tool-search-manifest.parquet  → s3://<bucket>/<prefix>tool-search-manifest.parquet
 *   public/search/tool-search-manifest.csv      → s3://<bucket>/<prefix>tool-search-manifest.csv
 *   public/search/tool-search-manifest.json     → s3://<bucket>/<prefix>tool-search-manifest.json
 *
 * All objects are uploaded with:
 *   - Cache-Control: public, max-age=3600, stale-while-revalidate=86400
 *   - Content-Type set per format
 *   - No ACL set (relies on bucket policy for public or pre-signed access)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const ROOT = process.cwd();
const ARTIFACT_DIR = path.join(ROOT, 'public/search');

const BUCKET = process.env.TOOL_SEARCH_S3_BUCKET;
const PREFIX = process.env.TOOL_SEARCH_S3_PREFIX ?? 'search/';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const UPLOAD_FILES = process.env.TOOL_SEARCH_UPLOAD_FILES ?? 'parquet,csv,json';

const ARTIFACTS = [
  {
    id: 'parquet',
    file: 'tool-search-manifest.parquet',
    contentType: 'application/vnd.apache.parquet',
  },
  {
    id: 'csv',
    file: 'tool-search-manifest.csv',
    contentType: 'text/csv; charset=utf-8',
  },
  {
    id: 'json',
    file: 'tool-search-manifest.json',
    contentType: 'application/json; charset=utf-8',
  },
];

const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

async function main() {
  if (!BUCKET) {
    throw new Error(
      'TOOL_SEARCH_S3_BUCKET environment variable is required.\n' +
        'Set it before running: TOOL_SEARCH_S3_BUCKET=my-bucket npm run upload:tool-search-manifest'
    );
  }

  const client = new S3Client({ region: REGION });
  const selectedIds = new Set(
    UPLOAD_FILES.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const artifactsToUpload = ARTIFACTS.filter((artifact) => selectedIds.has(artifact.id));

  if (artifactsToUpload.length === 0) {
    const allowed = ARTIFACTS.map((artifact) => artifact.id).join(', ');
    throw new Error(
      `No valid upload formats in TOOL_SEARCH_UPLOAD_FILES="${UPLOAD_FILES}". ` +
        `Allowed values: ${allowed}`
    );
  }

  for (const artifact of artifactsToUpload) {
    const filePath = path.join(ARTIFACT_DIR, artifact.file);
    let body;

    try {
      body = await fs.readFile(filePath);
    } catch {
      throw new Error(
        `Artifact not found: ${path.relative(ROOT, filePath)}\n` +
          'Run npm run build:tool-search-manifest first.'
      );
    }

    const key = `${PREFIX}${artifact.file}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: artifact.contentType,
      CacheControl: CACHE_CONTROL,
    });

    await client.send(command);
    console.log(`Uploaded s3://${BUCKET}/${key}  (${body.length} bytes)`);
  }

  console.log('\nSelected artifacts uploaded successfully.');
  console.log(
    `\nReminder: ensure the S3 bucket CORS policy allows GET from your site origin,\n` +
      `or generate pre-signed URLs from your backend for private buckets.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
