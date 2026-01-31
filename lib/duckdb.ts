import * as duckdb from '@duckdb/duckdb-wasm';

const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

export class DuckDBClient {
  static db: duckdb.AsyncDuckDB | null = null;
  static conn: duckdb.AsyncDuckDBConnection | null = null;

  static async init() {
    if (this.db) return;

    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
    );

    // Instantiate the asynchronus version of DuckDB-wasm
    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();
    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    // Revoke the worker URL
    URL.revokeObjectURL(worker_url);
  }

  static async getConnection() {
    if (!this.db) await this.init();
    if (!this.conn) {
      this.conn = await this.db!.connect();
    }
    return this.conn;
  }
  
  static async registerFile(name: string, buffer: Uint8Array) {
    if (!this.db) await this.init();
    await this.db!.registerFileBuffer(name, buffer);
  }
}
