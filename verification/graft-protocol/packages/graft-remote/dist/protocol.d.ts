import type { GraftByteRange, GraftListQuery } from "./types.js";
export declare const PROTOCOL_HEADER = "Graft-Protocol";
export declare const PROTOCOL_VERSION = "1";
export declare const MAX_METADATA_BYTES: number;
export declare const DEFAULT_LIST_LIMIT = 100;
export declare const MAX_LIST_LIMIT = 500;
export declare const GRAFT_REMOTE_CAPABILITIES: readonly ["range", "list", "list-cursor", "put-if-absent", "read-bundle", "fetch-bundle", "upload-bundle", "receive-pack", "receive-bundle", "cas", "cad"];
export declare const RECEIVE_PACK_ID_BYTES = 64;
export declare const RECEIVE_PACK_HEADER_PACK_ID = "x-graft-pack-id";
export declare const RECEIVE_PACK_HEADER_PACK_BYTES = "x-graft-pack-bytes";
export declare const RECEIVE_PACK_HEADER_INDEX_BYTES = "x-graft-index-bytes";
export declare const RECEIVE_PACK_HEADER_REPLACEMENT_HEX = "x-graft-ref-replacement-hex";
export declare const RECEIVE_BUNDLE_HEADER_MANIFEST_BYTES = "x-graft-bundle-manifest-bytes";
export declare const UPLOAD_BUNDLE_HEADER_TOTAL_BYTES = "x-graft-bundle-total-bytes";
export declare const READ_BUNDLE_HEADER_OBJECTS = "x-graft-bundle-objects";
export declare const MULTIPART_HEADER_OBJECT_BYTES = "x-graft-object-bytes";
export declare const MULTIPART_HEADER_UPLOAD_ID = "x-graft-upload-id";
export declare const MULTIPART_HEADER_PART_NUMBER = "x-graft-part-number";
export declare const MAX_RECEIVE_BUNDLE_OBJECTS = 256;
export declare const MAX_READ_BUNDLE_OBJECTS = 256;
export declare const MAX_UPLOAD_BUNDLE_OBJECTS = 65536;
export declare class GraftProtocolError extends Error {
    readonly status: number;
    readonly code: string;
    readonly headers?: HeadersInit;
    constructor(status: number, code: string, message: string, headers?: HeadersInit);
}
export declare function validateRepositorySegment(value: string): string;
export declare function validateEncodedPath(url: URL): void;
export declare function validateObjectPath(path: string): string;
export declare function validateObjectPrefix(prefix: string): string;
export declare function validateListQuery(url: URL): GraftListQuery;
export declare function encodeListCursor(prefix: string, after: string): string;
export declare function rejectUnexpectedQuery(url: URL): void;
export declare function isTransactionalPath(path: string): boolean;
export declare function isImmutablePath(path: string): boolean;
export declare function parseExpectedHeaders(headers: Headers): Uint8Array<ArrayBuffer> | undefined;
export declare function parseReceivePackHeaders(headers: Headers): {
    packId: string;
    packBytes: number;
    indexBytes: number;
    replacement: Uint8Array<ArrayBuffer>;
};
export interface ReceiveBundleObject {
    path: string;
    bytes: number;
    allowExisting: boolean;
}
export declare function parseReceiveBundleManifest(value: Uint8Array): ReceiveBundleObject[];
export declare function parseReceiveBundleManifestLength(headers: Headers): number;
export declare function readLimitedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>>;
export declare function parseRangeHeader(value: string | null, size: number): GraftByteRange | undefined;
export declare function protocolHeaders(initial?: HeadersInit): Headers;
export declare function emptyResponse(status?: number, initial?: HeadersInit): Response;
export declare function jsonResponse(value: unknown, status?: number, initial?: HeadersInit): Response;
export declare function errorResponse(error: unknown): Response;
export declare function bytesEqual(left: Uint8Array, right: Uint8Array): boolean;
export declare function bytewiseCompare(left: string, right: string): number;
//# sourceMappingURL=protocol.d.ts.map