import {
  bytewiseCompare,
  isTransactionalPath,
  type GraftByteRange,
  type GraftListQuery,
  type GraftListResult,
  type GraftObject,
  type GraftObjectMetadata,
  type GraftRepositoryBackend,
  type GraftWriteBody,
} from "@eidos.space/graft-remote";

import type { RepositoryDurableObject } from "./repository";

export class CloudflareRepositoryBackend implements GraftRepositoryBackend {
  readonly #objects: R2Bucket;
  readonly #repositoryId: string;
  readonly #metadata: DurableObjectStub<RepositoryDurableObject>;

  constructor(storage: CloudflareRepositoryStorage, repositoryId: string) {
    this.#objects = storage.objects;
    this.#repositoryId = repositoryId;
    this.#metadata = storage.repositories.getByName(repositoryId);
  }

  async head(path: string): Promise<GraftObjectMetadata | null> {
    if (isTransactionalPath(path)) {
      const size = await this.#metadata.headMetadata(path);
      return size === null ? null : { size };
    }
    const object = await this.#objects.head(this.r2Key(path));
    return object === null ? null : { size: object.size, etag: object.httpEtag };
  }

  async get(path: string, range?: GraftByteRange): Promise<GraftObject | null> {
    if (isTransactionalPath(path)) {
      const value = await this.#metadata.getMetadata(path);
      if (value === null) {
        return null;
      }
      const body = range === undefined ? value : value.slice(range.start, range.end + 1);
      return { body, size: value.byteLength };
    }

    const object = await this.#objects.get(
      this.r2Key(path),
      range === undefined
        ? undefined
        : { range: { offset: range.start, length: range.end - range.start + 1 } },
    );
    if (object === null) {
      return null;
    }
    return {
      body: object.body,
      size: object.size,
      etag: object.httpEtag,
      ...(object.httpMetadata?.contentType === undefined
        ? {}
        : { contentType: object.httpMetadata.contentType }),
    };
  }

  async put(path: string, value: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.#metadata.putMetadata(path, value);
  }

  async delete(path: string): Promise<void> {
    await this.#metadata.deleteMetadata(path);
  }

  async putIfAbsent(
    path: string,
    value: GraftWriteBody,
    kind: "transactional" | "immutable",
  ): Promise<boolean> {
    if (kind === "transactional") {
      if (!(value instanceof Uint8Array)) {
        throw new TypeError("Transactional metadata must be buffered");
      }
      return await this.#metadata.putMetadataIfAbsent(path, new Uint8Array(value));
    }
    const result = await this.#objects.put(this.r2Key(path), value, {
      onlyIf: new Headers({ "If-None-Match": "*" }),
      httpMetadata: { contentType: "application/octet-stream" },
    });
    return result !== null;
  }

  async compareAndSwap(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
    replacement: Uint8Array<ArrayBuffer>,
  ): Promise<boolean> {
    return await this.#metadata.compareAndSwapMetadata(path, expected, replacement);
  }

  async compareAndDelete(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
  ): Promise<boolean> {
    return await this.#metadata.compareAndDeleteMetadata(path, expected);
  }

  async list(query: GraftListQuery): Promise<GraftListResult> {
    const candidateLimit = query.limit + 1;
    const after = query.after ?? "";
    const [metadata, immutablePage] = await Promise.all([
      this.#metadata.listMetadata(query.prefix, query.after, candidateLimit),
      this.#objects.list({
        prefix: this.r2Key(query.prefix),
        limit: candidateLimit,
        ...(query.after === undefined ? {} : { startAfter: this.r2Key(query.after) }),
      }),
    ]);
    const objectKeyPrefix = this.r2Key("");
    const immutable = immutablePage.objects
      .map((object) => object.key.slice(objectKeyPrefix.length))
      .filter((path) => path.startsWith(query.prefix) && bytewiseCompare(path, after) > 0);
    const candidates = [...new Set([...metadata.paths, ...immutable])].sort(bytewiseCompare);
    return {
      paths: candidates.slice(0, query.limit),
      hasMore:
        candidates.length > query.limit || metadata.hasMore || immutablePage.truncated,
    };
  }

  private r2Key(path: string): string {
    return `repositories/${this.#repositoryId}/objects/${path}`;
  }
}

export interface CloudflareRepositoryStorage {
  objects: R2Bucket;
  repositories: DurableObjectNamespace<RepositoryDurableObject>;
}
