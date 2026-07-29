import { DurableObject } from "cloudflare:workers";

interface MetadataRow {
  [key: string]: SqlStorageValue;
  value: ArrayBuffer;
}

interface PathRow {
  [key: string]: SqlStorageValue;
  path: string;
}

interface ChangeRow {
  [key: string]: SqlStorageValue;
  changed: number;
}

export interface MetadataListResult {
  paths: string[];
  hasMore: boolean;
}

export class RepositoryDurableObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        path TEXT PRIMARY KEY,
        value BLOB NOT NULL
      )
    `);
  }

  async headMetadata(path: string): Promise<number | null> {
    return this.readMetadata(path)?.byteLength ?? null;
  }

  async getMetadata(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
    return this.readMetadata(path) ?? null;
  }

  async putMetadata(path: string, value: Uint8Array<ArrayBuffer>): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT INTO metadata(path, value) VALUES (?, ?)
       ON CONFLICT(path) DO UPDATE SET value = excluded.value`,
      path,
      exactArrayBuffer(value),
    );
  }

  async deleteMetadata(path: string): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM metadata WHERE path = ?", path);
  }

  async putMetadataIfAbsent(
    path: string,
    value: Uint8Array<ArrayBuffer>,
  ): Promise<boolean> {
    return (
      this.ctx.storage.sql
        .exec<ChangeRow>(
          "INSERT OR IGNORE INTO metadata(path, value) VALUES (?, ?) RETURNING 1 AS changed",
          path,
          exactArrayBuffer(value),
        )
        .toArray().length === 1
    );
  }

  async compareAndSwapMetadata(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
    replacement: Uint8Array<ArrayBuffer>,
  ): Promise<boolean> {
    const changed =
      expected === undefined
        ? this.ctx.storage.sql
            .exec<ChangeRow>(
              "INSERT OR IGNORE INTO metadata(path, value) VALUES (?, ?) RETURNING 1 AS changed",
              path,
              exactArrayBuffer(replacement),
            )
            .toArray().length
        : this.ctx.storage.sql
            .exec<ChangeRow>(
              "UPDATE metadata SET value = ? WHERE path = ? AND value = ? RETURNING 1 AS changed",
              exactArrayBuffer(replacement),
              path,
              exactArrayBuffer(expected),
            )
            .toArray().length;
    return changed === 1;
  }

  async compareAndDeleteMetadata(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
  ): Promise<boolean> {
    if (expected === undefined) {
      return this.readMetadata(path) === undefined;
    }
    return (
      this.ctx.storage.sql
        .exec<ChangeRow>(
          "DELETE FROM metadata WHERE path = ? AND value = ? RETURNING 1 AS changed",
          path,
          exactArrayBuffer(expected),
        )
        .toArray().length === 1
    );
  }

  async listMetadata(
    prefix: string,
    after: string | undefined,
    limit: number,
  ): Promise<MetadataListResult> {
    const rows = this.ctx.storage.sql
      .exec<PathRow>(
        `SELECT path FROM metadata
         WHERE substr(path, 1, ?) = ? AND path COLLATE BINARY > ? COLLATE BINARY
         ORDER BY path COLLATE BINARY
         LIMIT ?`,
        [...prefix].length,
        prefix,
        after ?? "",
        limit + 1,
      )
      .toArray()
      .map((row) => row.path);
    return { paths: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  private readMetadata(path: string): Uint8Array<ArrayBuffer> | undefined {
    const row = this.ctx.storage.sql
      .exec<MetadataRow>("SELECT value FROM metadata WHERE path = ?", path)
      .toArray()[0];
    return row === undefined ? undefined : new Uint8Array(row.value.slice(0));
  }
}

function exactArrayBuffer(value: Uint8Array): ArrayBuffer {
  return new Uint8Array(value).buffer;
}
