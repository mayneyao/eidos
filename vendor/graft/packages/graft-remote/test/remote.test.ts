import { describe, expect, it } from "vitest";

import {
  GraftProtocolError,
  bytewiseCompare,
  bytesEqual,
  createGraftRemoteHandler,
  type GraftByteRange,
  type GraftListQuery,
  type GraftObject,
  type GraftObjectMetadata,
  type GraftRepositoryBackend,
  type GraftWriteBody,
} from "../src/index.js";

const ORIGIN = "https://remote.example";

class MemoryRepository implements GraftRepositoryBackend {
  readonly objects = new Map<string, Uint8Array<ArrayBuffer>>();

  head(path: string): GraftObjectMetadata | null {
    const value = this.objects.get(path);
    return value === undefined ? null : { size: value.byteLength };
  }

  get(path: string, range?: GraftByteRange): GraftObject | null {
    const value = this.objects.get(path);
    if (value === undefined) {
      return null;
    }
    const body =
      range === undefined ? value.slice() : value.slice(range.start, range.end + 1);
    return { body, size: value.byteLength };
  }

  put(path: string, value: Uint8Array<ArrayBuffer>): void {
    this.objects.set(path, value.slice());
  }

  delete(path: string): void {
    this.objects.delete(path);
  }

  async putIfAbsent(path: string, value: GraftWriteBody): Promise<boolean> {
    if (this.objects.has(path)) {
      return false;
    }
    this.objects.set(path, await bodyBytes(value));
    return true;
  }

  compareAndSwap(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
    replacement: Uint8Array<ArrayBuffer>,
  ): boolean {
    const current = this.objects.get(path);
    if (!expectedMatches(current, expected)) {
      return false;
    }
    this.objects.set(path, replacement.slice());
    return true;
  }

  compareAndDelete(path: string, expected: Uint8Array<ArrayBuffer> | undefined): boolean {
    const current = this.objects.get(path);
    if (!expectedMatches(current, expected)) {
      return false;
    }
    if (expected !== undefined) {
      this.objects.delete(path);
    }
    return true;
  }

  list(query: GraftListQuery): { paths: string[]; hasMore: boolean } {
    const matching = [...this.objects.keys()]
      .filter(
        (path) =>
          path.startsWith(query.prefix) &&
          (query.after === undefined || bytewiseCompare(path, query.after) > 0),
      )
      .sort(bytewiseCompare);
    return {
      paths: matching.slice(0, query.limit),
      hasMore: matching.length > query.limit,
    };
  }
}

function createTestApp() {
  const repositories = new Map<string, MemoryRepository>();
  return createGraftRemoteHandler({
    authenticate({ request }) {
      if (request.headers.get("Authorization") !== "Bearer test-token") {
        throw new GraftProtocolError(401, "unauthorized", "A valid bearer token is required", {
          "WWW-Authenticate": 'Bearer realm="graft-remote"',
        });
      }
    },
    backend({ repository }) {
      let backend = repositories.get(repository.id);
      if (backend === undefined) {
        backend = new MemoryRepository();
        repositories.set(repository.id, backend);
      }
      return backend;
    },
  });
}

async function remoteFetch(
  app: ReturnType<typeof createTestApp>,
  path: string,
  init: RequestInit = {},
  options: { token?: string; protocol?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${options.token ?? "test-token"}`);
  headers.set("Graft-Protocol", options.protocol ?? "1");
  return await handlerFetch(app, path, { ...init, headers });
}

describe("createGraftRemoteHandler", () => {
  it("negotiates authentication and protocol without a framework dependency", async () => {
    const app = createTestApp();

    const unauthorized = await handlerFetch(app, "/acme/archive", {
      headers: { "Graft-Protocol": "1" },
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("Bearer");
    expect(unauthorized.headers.get("graft-protocol")).toBe("1");

    const unsupported = await remoteFetch(app, "/acme/archive", {}, { protocol: "2" });
    expect(unsupported.status).toBe(426);

    const descriptor = await remoteFetch(app, "/acme/archive");
    expect(descriptor.status).toBe(200);
    expect(await descriptor.json()).toMatchObject({
      protocol: "graft-remote",
      version: 1,
      repository: "acme/archive",
      capabilities: expect.arrayContaining(["range", "list", "cas"]),
    });
  });

  it("separates authentication, authorization, repository mapping, and storage", async () => {
    const backend = new MemoryRepository();
    const authorized: Array<{ action: string; principal: string; repository: string }> = [];
    let backendOpens = 0;
    const app = createGraftRemoteHandler<undefined, string>({
      authenticate: () => "user-1",
      repositoryId: ({ namespace, name }) => `tenant-7:${namespace}/${name}`,
      authorize({ action, principal, repository }) {
        if (principal === undefined) {
          throw new Error("authenticated principal is missing");
        }
        authorized.push({ action, principal, repository: repository.id });
        if (action === "write") {
          throw new GraftProtocolError(403, "forbidden", "Write access denied");
        }
      },
      backend() {
        backendOpens += 1;
        return backend;
      },
    });
    const headers = { Authorization: "Bearer ignored", "Graft-Protocol": "1" };

    const descriptor = await handlerFetch(app, "/acme/archive", { headers });
    expect(descriptor.status).toBe(200);
    expect(await descriptor.json()).toMatchObject({ repository: "tenant-7:acme/archive" });

    const denied = await handlerFetch(app, "/acme/archive/raw/HEAD", {
      method: "PUT",
      headers,
      body: "main\n",
    });
    expect(denied.status).toBe(403);
    expect(backendOpens).toBe(1);
    expect(authorized).toEqual([
      { action: "discover", principal: "user-1", repository: "tenant-7:acme/archive" },
      { action: "write", principal: "user-1", repository: "tenant-7:acme/archive" },
    ]);
  });

  it("streams immutable objects with create-only and range semantics", async () => {
    const app = createTestApp();
    const path = "/objects/repo/raw-if-not-exists/objects/pack/data.pack";
    expect((await remoteFetch(app, path, { method: "PUT", body: "abcdef" })).status).toBe(204);
    expect((await remoteFetch(app, path, { method: "PUT", body: "changed" })).status).toBe(412);

    const full = await remoteFetch(app, "/objects/repo/raw/objects/pack/data.pack");
    expect(await full.text()).toBe("abcdef");

    const range = await remoteFetch(app, "/objects/repo/raw/objects/pack/data.pack", {
      headers: { Range: "bytes=1-3" },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toBe("bytes 1-3/6");
    expect(await range.text()).toBe("bcd");

    const unsatisfiable = await remoteFetch(app, "/objects/repo/raw/objects/pack/data.pack", {
      headers: { Range: "bytes=99-100" },
    });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("content-range")).toBe("bytes */6");
  });

  it("performs atomic CAS and CAD for transactional metadata", async () => {
    const app = createTestApp();
    const ref = "/cas/repo/cas/refs/heads/main";
    const created = await remoteFetch(app, ref, {
      method: "POST",
      headers: { "x-graft-expected-present": "false", "x-graft-expected-hex": "" },
      body: "a\n",
    });
    expect(created.status).toBe(204);

    const contenders = await Promise.all(
      ["b\n", "c\n"].map((body) =>
        remoteFetch(app, ref, {
          method: "POST",
          headers: { "x-graft-expected-present": "true", "x-graft-expected-hex": "610a" },
          body,
        }),
      ),
    );
    expect(contenders.map((response) => response.status).sort()).toEqual([204, 409]);

    const current = await remoteFetch(app, "/cas/repo/raw/refs/heads/main");
    const value = await current.text();
    const expectedHex = value === "b\n" ? "620a" : "630a";
    expect(
      (
        await remoteFetch(app, "/cas/repo/cad/refs/heads/main", {
          method: "POST",
          headers: {
            "x-graft-expected-present": "true",
            "x-graft-expected-hex": expectedHex,
          },
        })
      ).status,
    ).toBe(204);
  });

  it("owns cursor pagination while the backend only lists ordered paths", async () => {
    const app = createTestApp();
    for (const path of ["objects/aa/one", "objects/bb/two", "objects/cc/three"]) {
      expect(
        (
          await remoteFetch(app, `/list/repo/raw-if-not-exists/${path}`, {
            method: "PUT",
            body: path,
          })
        ).status,
      ).toBe(204);
    }

    const paths: string[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: "2" });
      if (cursor === undefined) query.set("prefix", "objects/");
      else query.set("cursor", cursor);
      const response = await remoteFetch(app, `/list/repo/list?${query}`);
      const page = (await response.json()) as { paths: string[]; next_cursor?: string };
      paths.push(...page.paths);
      cursor = page.next_cursor;
    } while (cursor !== undefined);
    expect(paths).toEqual(["objects/aa/one", "objects/bb/two", "objects/cc/three"]);
  });

  it("isolates repositories and rejects unsafe paths", async () => {
    const app = createTestApp();
    await remoteFetch(app, "/isolation/one/raw-if-not-exists/HEAD", {
      method: "PUT",
      body: "one",
    });
    await remoteFetch(app, "/isolation/two/raw-if-not-exists/HEAD", {
      method: "PUT",
      body: "two",
    });
    expect(await (await remoteFetch(app, "/isolation/one/raw/HEAD")).text()).toBe("one");
    expect(await (await remoteFetch(app, "/isolation/two/raw/HEAD")).text()).toBe("two");

    const reserved = await remoteFetch(app, "/safety/repo/raw-if-not-exists/locks/ref.lock", {
      method: "PUT",
      body: "value",
    });
    expect(reserved.status).toBe(400);

    const encodedSlash = await remoteFetch(
      app,
      "/safety/repo/raw-if-not-exists/objects%2Fhidden",
      { method: "PUT", body: "value" },
    );
    expect(encodedSlash.status).toBe(400);
  });
});

async function handlerFetch(
  handler: ReturnType<typeof createTestApp>,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const request = new Request(`${ORIGIN}${path}`, init);
  return await handler({
    request,
    route: routeParameters(request.url),
    adapterContext: undefined,
  });
}

function routeParameters(url: string): {
  namespace?: string;
  repository?: string;
  operation?: string;
  objectPath?: string;
} {
  const segments = new URL(url).pathname.slice(1).split("/").map(decodeURIComponent);
  const [namespace, repository, operation, ...objectSegments] = segments;
  return {
    ...(namespace === undefined ? {} : { namespace }),
    ...(repository === undefined ? {} : { repository }),
    ...(operation === undefined ? {} : { operation }),
    ...(objectSegments.length === 0 ? {} : { objectPath: objectSegments.join("/") }),
  };
}

async function bodyBytes(body: GraftWriteBody): Promise<Uint8Array<ArrayBuffer>> {
  if (body instanceof Uint8Array) {
    return body.slice();
  }
  const bytes = await new Response(body).arrayBuffer();
  return new Uint8Array(bytes);
}

function expectedMatches(
  current: Uint8Array<ArrayBuffer> | undefined,
  expected: Uint8Array<ArrayBuffer> | undefined,
): boolean {
  if (current === undefined || expected === undefined) {
    return current === expected;
  }
  return bytesEqual(current, expected);
}
