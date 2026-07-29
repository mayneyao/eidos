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
  type GraftWriteOptions,
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
        : {
            range: { offset: range.start, length: range.end - range.start + 1 },
          },
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
    options?: GraftWriteOptions,
  ): Promise<boolean> {
    if (kind === "transactional") {
      if (!(value instanceof Uint8Array)) {
        throw new TypeError("Transactional metadata must be buffered");
      }
      return await this.#metadata.putMetadataIfAbsent(path, new Uint8Array(value));
    }
    return await this.putImmutable(path, value, options);
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
      hasMore: candidates.length > query.limit || metadata.hasMore || immutablePage.truncated,
    };
  }

  private r2Key(path: string): string {
    return `repositories/${this.#repositoryId}/objects/${path}`;
  }

  private async putImmutable(
    path: string,
    value: GraftWriteBody,
    options: GraftWriteOptions | undefined,
  ): Promise<boolean> {
    const fixed = fixedR2Body(value, options?.contentLength);
    try {
      const result = await this.#objects.put(this.r2Key(path), fixed.body, {
        onlyIf: new Headers({ "If-None-Match": "*" }),
        httpMetadata: { contentType: "application/octet-stream" },
      });
      if (result === null) await fixed.cancel();
      await fixed.finish(result !== null);
      return result !== null;
    } catch (error) {
      await fixed.cancel();
      await fixed.finish(false);
      throw error;
    }
  }
}

export interface CloudflareRepositoryStorage {
  objects: R2Bucket;
  repositories: DurableObjectNamespace<RepositoryDurableObject>;
}

interface FixedR2Body {
  body: GraftWriteBody;
  cancel(): Promise<void>;
  finish(consumed: boolean): Promise<void>;
}

function fixedR2Body(value: GraftWriteBody, contentLength: number | undefined): FixedR2Body {
  if (value instanceof Uint8Array || contentLength === undefined) {
    return {
      body: value,
      cancel: async () => undefined,
      finish: async () => undefined,
    };
  }
  const fixed = new FixedLengthStream(contentLength);
  const body = fixed.readable as ReadableStream<Uint8Array>;
  const completed = value.pipeTo(fixed.writable);
  void completed.catch(() => undefined);
  return {
    body,
    async cancel() {
      if (!body.locked) {
        try {
          await body.cancel("immutable target already exists or upload failed");
        } catch {
          // The R2 operation may already have canceled the fixed-length stream.
        }
      }
    },
    async finish(consumed) {
      try {
        await completed;
      } catch (error) {
        if (consumed) throw error;
      }
    },
  };
}
