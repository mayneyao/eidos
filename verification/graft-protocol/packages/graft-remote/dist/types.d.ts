import type { EncryptedRoutingHint } from "./encrypted-routing.js";
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
    /** Structurally validated public hint; publish derived rows atomically with it. */
    routingHint?: EncryptedRoutingHint;
}
export interface GraftListQuery {
    prefix: string;
    after?: string;
    limit: number;
}
export interface GraftListResult {
    paths: string[];
    hasMore: boolean;
    entries?: GraftListEntry[];
}
export interface GraftListEntry extends GraftObjectMetadata {
    path: string;
}
export interface GraftMultipartPart {
    partNumber: number;
    bytes: number;
}
export interface GraftMultipartUpload {
    uploadId: string;
    totalBytes: number;
    partBytes: number;
    uploadedParts: GraftMultipartPart[];
    encryption?: GraftMultipartEncryptionIdentity;
}
export interface GraftMultipartEncryptionIdentity {
    uuid: string;
    uploadId: string;
    ciphertextSha256: string;
}
export interface GraftMultipartBackend {
    /** Opt in only when identity, digest, and atomic publication are enforced. */
    readonly supportsEncryption?: true;
    start(path: string, totalBytes: number, partBytes: number, encryption?: GraftMultipartEncryptionIdentity): MaybePromise<GraftMultipartUpload | null>;
    uploadPart(path: string, uploadId: string, partNumber: number, value: ReadableStream<Uint8Array>, contentLength: number): MaybePromise<void>;
    complete(path: string, uploadId: string): MaybePromise<boolean>;
    abort(path: string, uploadId: string): MaybePromise<void>;
}
export interface GraftRepositoryBackend {
    /** Persisted repository identity; changing this requires a new remote. */
    readonly encryption?: GraftEncryptionDescriptor;
    readonly encryptedRouting?: {
        select(target: string, have: string | null): MaybePromise<Array<Pick<EncryptedRoutingHint, "key" | "pack" | "index">> | null>;
    };
    head(path: string): MaybePromise<GraftObjectMetadata | null>;
    get(path: string, range?: GraftByteRange): MaybePromise<GraftObject | null>;
    put(path: string, value: Uint8Array<ArrayBuffer>): MaybePromise<void>;
    delete(path: string): MaybePromise<void>;
    putIfAbsent(path: string, value: GraftWriteBody, kind: "transactional" | "immutable", options?: GraftWriteOptions): MaybePromise<boolean>;
    compareAndSwap(path: string, expected: Uint8Array<ArrayBuffer> | undefined, replacement: Uint8Array<ArrayBuffer>): MaybePromise<boolean>;
    compareAndDelete(path: string, expected: Uint8Array<ArrayBuffer> | undefined): MaybePromise<boolean>;
    list(query: GraftListQuery): MaybePromise<GraftListResult>;
    multipart?: GraftMultipartBackend;
}
export type GraftRemoteAction = "discover" | "read" | "write";
export type GraftRemoteOperation = "e2ee-read-bundle" | "e2ee-fetch-bundle" | "e2ee-receive-bundle" | "descriptor" | "raw" | "raw-if-not-exists" | "read-bundle" | "fetch-bundle" | "upload-bundle" | "receive-pack" | "receive-bundle" | "multipart-start" | "multipart-part" | "multipart-complete" | "multipart-abort" | "cas" | "cad" | "list";
export interface GraftEncryptionDescriptor {
    profile: "encrypted-remote-v1";
    version: 1;
    suite: 1;
    uuid: string;
}
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
    backend(request: GraftRequestContext<AdapterContext, Principal>): MaybePromise<GraftRepositoryBackend | null>;
    authenticate?(request: GraftHandlerRequest<AdapterContext>): MaybePromise<Principal>;
    authorize?(request: GraftRequestContext<AdapterContext, Principal>): MaybePromise<void>;
    repositoryId?(repository: Omit<GraftRepository, "id">, request: GraftHandlerRequest<AdapterContext>): MaybePromise<string>;
    onError?(error: unknown, request: GraftHandlerRequest<AdapterContext>): MaybePromise<void>;
    limits?: {
        maxRequestBytes?: number;
        multipartPartBytes?: number;
    };
}
export type GraftRemoteHandler<AdapterContext> = (request: GraftHandlerRequest<AdapterContext>) => Promise<Response>;
//# sourceMappingURL=types.d.ts.map