export type MaybePromise<T> = T | Promise<T>;

export interface GraftRepository {
  namespace: string;
  name: string;
  id: string;
}

export interface GraftByteRange {
  start: number;
  end: number;
}

export interface GraftObjectMetadata {
  size: number;
  etag?: string;
  contentType?: string;
}

export type GraftObjectBody = ArrayBuffer | Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>;

export interface GraftObject extends GraftObjectMetadata {
  body: GraftObjectBody;
}

export type GraftWriteBody = Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>;

export interface GraftWriteOptions {
  contentLength?: number;
}

export interface GraftListQuery {
  prefix: string;
  after?: string;
  limit: number;
}

export interface GraftListResult {
  paths: string[];
  hasMore: boolean;
}

export interface GraftRepositoryBackend {
  head(path: string): MaybePromise<GraftObjectMetadata | null>;
  get(path: string, range?: GraftByteRange): MaybePromise<GraftObject | null>;
  put(path: string, value: Uint8Array<ArrayBuffer>): MaybePromise<void>;
  delete(path: string): MaybePromise<void>;
  putIfAbsent(
    path: string,
    value: GraftWriteBody,
    kind: "transactional" | "immutable",
    options?: GraftWriteOptions,
  ): MaybePromise<boolean>;
  compareAndSwap(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
    replacement: Uint8Array<ArrayBuffer>,
  ): MaybePromise<boolean>;
  compareAndDelete(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
  ): MaybePromise<boolean>;
  list(query: GraftListQuery): MaybePromise<GraftListResult>;
}

export type GraftRemoteAction = "discover" | "read" | "write";

export type GraftRemoteOperation =
  | "descriptor"
  | "raw"
  | "raw-if-not-exists"
  | "receive-pack"
  | "cas"
  | "cad"
  | "list";

export interface GraftRouteParameters {
  namespace?: string;
  repository?: string;
  operation?: string;
  objectPath?: string;
}

export interface GraftHandlerRequest<AdapterContext> {
  request: Request;
  route: GraftRouteParameters;
  adapterContext: AdapterContext;
}

export interface GraftRequestContext<AdapterContext, Principal> {
  request: Request;
  adapterContext: AdapterContext;
  repository: GraftRepository;
  operation: GraftRemoteOperation;
  action: GraftRemoteAction;
  objectPath?: string;
  principal: Principal | undefined;
}

export interface GraftRemoteOptions<AdapterContext = undefined, Principal = undefined> {
  backend(
    request: GraftRequestContext<AdapterContext, Principal>,
  ): MaybePromise<GraftRepositoryBackend | null>;
  authenticate?(request: GraftHandlerRequest<AdapterContext>): MaybePromise<Principal>;
  authorize?(request: GraftRequestContext<AdapterContext, Principal>): MaybePromise<void>;
  repositoryId?(
    repository: Omit<GraftRepository, "id">,
    request: GraftHandlerRequest<AdapterContext>,
  ): MaybePromise<string>;
  onError?(error: unknown, request: GraftHandlerRequest<AdapterContext>): MaybePromise<void>;
}

export type GraftRemoteHandler<AdapterContext> = (
  request: GraftHandlerRequest<AdapterContext>,
) => Promise<Response>;
