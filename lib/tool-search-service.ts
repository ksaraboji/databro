/**
 * Tool search service — loads a Parquet/CSV search index into DuckDB-Wasm
 * and executes ranked keyword queries against it.
 *
 * Usage:
 *   const service = ToolSearchService.getInstance();
 *   await service.init(S3_URL_OR_LOCAL_PATH);
 *   const results = await service.search("json formatter");
 */

import type { ToolSearchRecord } from './tool-search-schema';

export type ToolSearchResult = {
  toolId: string;
  toolName: string;
  toolUrl: string;
  categoryTitle: string;
  description: string;
  score: number;
};

export type ToolSearchServiceState = 'idle' | 'loading' | 'ready' | 'error';

const TABLE_NAME = 'tool_search';
const DEFAULT_RESULT_LIMIT = 5;

// Singleton — DuckDB-Wasm is heavy; init once per session.
let _instance: ToolSearchService | null = null;

export class ToolSearchService {
  private state: ToolSearchServiceState = 'idle';
  private initError: string | null = null;
  private ftsAvailable = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private conn: any = null;

  static getInstance(): ToolSearchService {
    if (!_instance) _instance = new ToolSearchService();
    return _instance;
  }

  isFtsAvailable(): boolean {
    return this.ftsAvailable;
  }

  getState(): ToolSearchServiceState {
    return this.state;
  }

  getInitError(): string | null {
    return this.initError;
  }

  /**
   * Initialize DuckDB-Wasm and load the search index from `sourceUrl`.
   * Safe to call multiple times — subsequent calls are no-ops once ready.
   *
   * @param sourceUrl Absolute URL to the .parquet or .csv manifest, or a
   *                  relative path served by Next.js (e.g. /search/tool-search-manifest.parquet)
   */
  async init(sourceUrl: string): Promise<void> {
    if (this.state === 'ready') return;
    if (this.state === 'loading') {
      // Wait for in-flight init to complete
      await this._waitUntilReady();
      return;
    }

    this.state = 'loading';
    this.initError = null;

    try {
      const duckdb = await import('@duckdb/duckdb-wasm');

      // Use locally-served bundles (public/_duckdb/) to avoid CDN CORS/COEP issues.
      // Always use the EH bundle — avoids the 33 MB COI/pthread WASM and thread
      // complexity while still supporting modern browsers (EH = exception-handling).
      // Absolute URLs are required so the Worker can fetch the WASM from the same origin.
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const EH_BUNDLE = {
        mainModule: `${origin}/_duckdb/duckdb-eh.wasm`,
        mainWorker: `${origin}/_duckdb/duckdb-browser-eh.worker.js`,
      };

      const worker = new Worker(EH_BUNDLE.mainWorker);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(EH_BUNDLE.mainModule, undefined);

      this.conn = await this.db.connect();

      await this._loadIndex(sourceUrl);
      await this._trySetupFts();
      this.state = 'ready';
    } catch (err) {
      this.state = 'error';
      this.initError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Search for tools matching `query`.
   * Falls back to local static list search if DuckDB is not ready.
   */
  async search(
    query: string,
    limit: number = DEFAULT_RESULT_LIMIT
  ): Promise<ToolSearchResult[]> {
    if (!query || query.trim().length < 2) return [];

    if (this.state !== 'ready' || !this.conn) {
      return [];
    }

    const sanitized = query.trim().replace(/'/g, "''").substring(0, 200);
    const tokens = sanitized
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);

    if (tokens.length === 0) return [];

    const sql = this.ftsAvailable
      ? this._buildFtsQuery(sanitized, limit)
      : this._buildSearchQuery(tokens, sanitized, limit);
    const result = await this.conn.query(sql);

    const rows = result.toArray();
    return rows.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any): ToolSearchResult => {
        // Arrow RecordBatch rows expose fields via get() or toJSON()
        const r = typeof row.toJSON === 'function' ? row.toJSON() : row;
        return {
          toolId: r['tool_id'] ?? '',
          toolName: r['tool_name'] ?? '',
          toolUrl: r['tool_url'] ?? '',
          categoryTitle: r['category_title'] ?? '',
          description: r['description'] ?? '',
          score: Number(r['score'] ?? 0),
        };
      }
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async _loadIndex(sourceUrl: string): Promise<void> {
    const isParquet =
      sourceUrl.endsWith('.parquet') || sourceUrl.includes('.parquet?');
    const isHttp =
      sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://');
    const isRelative = sourceUrl.startsWith('/');

    if (isParquet) {
      if (isHttp) {
        // Remote Parquet: fetch and register as buffer
        const resp = await fetch(sourceUrl);
        if (!resp.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${resp.status}`);
        const buffer = new Uint8Array(await resp.arrayBuffer());
        await this.db.registerFileBuffer('tool_search.parquet', buffer);
        await this.conn.query(
          `CREATE TABLE ${TABLE_NAME} AS SELECT * FROM read_parquet('tool_search.parquet')`
        );
      } else if (isRelative) {
        // Local Next.js public path — fetch via absolute URL at runtime
        const absoluteUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}${sourceUrl}`
            : sourceUrl;
        const resp = await fetch(absoluteUrl);
        if (!resp.ok) throw new Error(`Failed to fetch ${absoluteUrl}: ${resp.status}`);
        const buffer = new Uint8Array(await resp.arrayBuffer());
        // Access the underlying AsyncDuckDB instance to register the file buffer
        // conn._db is an internal reference; we use a workaround via conn.query
        await this._registerAndLoadBuffer('tool_search.parquet', buffer, isParquet);
      }
    } else {
      // CSV fallback — DuckDB can read CSV directly from URL
      const absoluteUrl =
        isRelative && typeof window !== 'undefined'
          ? `${window.location.origin}${sourceUrl}`
          : sourceUrl;
      const resp = await fetch(absoluteUrl);
      if (!resp.ok) throw new Error(`Failed to fetch ${absoluteUrl}: ${resp.status}`);
      const text = await resp.text();
      const encoder = new TextEncoder();
      const buffer = encoder.encode(text);
      await this._registerAndLoadBuffer('tool_search.csv', buffer, false);
    }
  }

  private async _registerAndLoadBuffer(
    filename: string,
    buffer: Uint8Array,
    isParquet: boolean
  ): Promise<void> {
    await this.db.registerFileBuffer(filename, buffer);

    const readFn = isParquet
      ? `read_parquet('${filename}')`
      : `read_csv_auto('${filename}')`;

    await this.conn.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} AS SELECT * FROM ${readFn}`
    );
  }

  /**
   * Attempt to install and load the DuckDB FTS extension, then create a
   * BM25 index over `search_text` (and `tool_name`, `keywords`).
   * Silently degrades — if the extension is unavailable in the wasm bundle
   * (e.g. the EH bundle doesn't ship it), `ftsAvailable` stays false and
   * all searches fall through to the LIKE-based scorer.
   */
  private async _trySetupFts(): Promise<void> {
    const step = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        if (process.env.NODE_ENV !== 'production') console.debug(`[FTS] ${label} OK`);
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.debug(`[FTS] ${label} FAILED:`, e);
        throw e;
      }
    };
    try {
      // Log the DuckDB core version so we can identify the right extension build.
      const verResult = await this.conn.query(`SELECT version() AS v`);
      const dbVersion = verResult.toArray()[0]?.toJSON()?.v ?? 'unknown';
      if (process.env.NODE_ENV !== 'production') console.debug('[FTS] DuckDB version:', dbVersion);

      await step('SET autoinstall_extension_repository', () =>
        this.conn.query(`SET autoinstall_extension_repository='https://extensions.duckdb.org'`)
      );
      await step('SET autoload_known_extensions', () =>
        this.conn.query(`SET autoload_known_extensions=true`)
      );
      await step('SET autoinstall_known_extensions', () =>
        this.conn.query(`SET autoinstall_known_extensions=true`)
      );
      await step('INSTALL fts', () => this.conn.query(`INSTALL fts`));
      await step('LOAD fts', () => this.conn.query(`LOAD fts`));

      // Build a BM25 index covering name, keywords, and full search_text.
      // stemmer='english' improves recall for inflected forms.
      await step('create_fts_index', () =>
        this.conn.query(
          `PRAGMA create_fts_index(
            '${TABLE_NAME}',
            'tool_id',
            'tool_name', 'keywords', 'search_text',
            stemmer='english',
            overwrite=1
          )`
        )
      );

      // Probe: match_bm25 is a scalar function — call it from the base table,
      // not as a FROM-clause table function.
      await step('probe match_bm25', () =>
        this.conn.query(
          `SELECT fts_main_${TABLE_NAME}.match_bm25(tool_id, 'test') AS score
           FROM ${TABLE_NAME} LIMIT 1`
        )
      );
      this.ftsAvailable = true;
    } catch {
      // FTS not available in this wasm bundle — LIKE fallback will be used.
      this.ftsAvailable = false;
    }
  }

  /**
   * BM25-ranked FTS query.  Joins the match_bm25 virtual table back to the
   * main table to retrieve all display columns, then blends in the
   * name-exact bonus and popularity tie-breaker.
   */
  private _buildFtsQuery(rawQuery: string, limit: number): string {
    const escaped = rawQuery.replace(/'/g, "''");
    // match_bm25 is a scalar function — call it from the base table.
    // fields := restricts scoring to the specified columns.
    return `
      WITH pop_max AS (
        SELECT MAX(popularity_weight) AS mx FROM ${TABLE_NAME}
      )
      SELECT
        t.tool_id,
        t.tool_name,
        t.tool_url,
        t.category_title,
        t.description,
        (
          fts_main_${TABLE_NAME}.match_bm25(t.tool_id, '${escaped}', fields := 'tool_name,keywords,search_text')
          + CASE WHEN lower(t.tool_name) LIKE '%${escaped.toLowerCase()}%' THEN 2.0 ELSE 0.0 END
          + (t.popularity_weight / pop_max.mx) * 0.5
        ) AS score
      FROM ${TABLE_NAME} t
      CROSS JOIN pop_max
      WHERE fts_main_${TABLE_NAME}.match_bm25(t.tool_id, '${escaped}', fields := 'tool_name,keywords,search_text') IS NOT NULL
      ORDER BY score DESC
      LIMIT ${limit}
    `;
  }

  /** Weighted token-matching query — works without any DuckDB extension */
  private _buildSearchQuery(tokens: string[], rawQuery: string, limit: number): string {
    // Score components (all normalised 0–1, higher = better match):
    //   name_exact   — full raw query appears in tool_name (case-insensitive)
    //   name_token   — any token matches tool_name
    //   kw_token     — any token matches keywords column
    //   desc_token   — any token matches description column
    //   popularity   — popularity_weight tie-breaker (normalised across table max)

    const nameExact = `CASE WHEN lower(tool_name) LIKE '%${rawQuery.toLowerCase()}%' THEN 1.0 ELSE 0.0 END`;

    const nameTokens = tokens
      .map((t) => `CASE WHEN lower(tool_name)    LIKE '%${t}%' THEN 1.0 ELSE 0.0 END`)
      .join(' + ');

    const kwTokens = tokens
      .map((t) => `CASE WHEN lower(keywords)      LIKE '%${t}%' THEN 1.0 ELSE 0.0 END`)
      .join(' + ');

    const descTokens = tokens
      .map((t) => `CASE WHEN lower(search_text)   LIKE '%${t}%' THEN 1.0 ELSE 0.0 END`)
      .join(' + ');

    const tokenCount = tokens.length;

    return `
      SELECT
        tool_id,
        tool_name,
        tool_url,
        category_title,
        description,
        (
          (${nameExact}) * 4.0
          + ((${nameTokens}) / ${tokenCount}) * 3.0
          + ((${kwTokens}) / ${tokenCount}) * 2.0
          + ((${descTokens}) / ${tokenCount}) * 1.0
          + (popularity_weight / (SELECT MAX(popularity_weight) FROM ${TABLE_NAME})) * 0.5
        ) AS score
      FROM ${TABLE_NAME}
      WHERE (${nameExact}) > 0
         OR (${nameTokens}) > 0
         OR (${kwTokens}) > 0
         OR (${descTokens}) > 0
      ORDER BY score DESC
      LIMIT ${limit}
    `;
  }

  private _waitUntilReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (this.state === 'ready') {
          clearInterval(interval);
          resolve();
        } else if (this.state === 'error') {
          clearInterval(interval);
          reject(new Error(this.initError ?? 'ToolSearchService init failed'));
        }
      }, 100);
    });
  }
}

// ─── Convenience hook-like helper for React components ──────────────────────

/**
 * Returns the singleton service pre-configured with the default local Parquet path.
 * Call this once in the search component on mount.
 */
export async function initToolSearchService(
  sourceUrl = '/search/tool-search-manifest.parquet'
): Promise<ToolSearchService> {
  const service = ToolSearchService.getInstance();
  await service.init(sourceUrl);
  return service;
}

/**
 * Validate that a tool URL returned from search is a known /tools/ path.
 * Prevents open-redirect if the search index is ever tampered with.
 */
export function validateToolUrl(url: string): string | null {
  if (typeof url !== 'string') return null;
  if (!url.startsWith('/tools/')) return null;
  // Only allow slug-like segments: letters, digits, hyphens
  const path = url.slice('/tools/'.length);
  if (!/^[a-z0-9-]+$/.test(path)) return null;
  return url;
}

// Re-export schema types for convenience
export type { ToolSearchRecord };
