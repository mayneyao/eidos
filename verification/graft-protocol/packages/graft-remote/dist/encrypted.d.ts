import type { GraftEncryptionDescriptor, GraftRemoteOperation, GraftRepositoryBackend } from "./types.js";
import { EncryptedRoutingIndex, type EncryptedRoutingHint } from "./encrypted-routing.js";
export declare const ENCRYPTED_CAPABILITIES: readonly ["range", "list", "list-cursor", "put-if-absent", "cas", "cad", "e2ee-read-bundle", "e2ee-fetch-bundle", "e2ee-receive-bundle"];
export declare function validateEncryptionDescriptor(value: GraftEncryptionDescriptor): void;
export declare function encryptedOperation(request: Request, backend: GraftRepositoryBackend, operation: GraftRemoteOperation, path: string | undefined, url: URL, requestLimit: number | undefined, routing: EncryptedRoutingIndex): Promise<Response | undefined>;
export declare function validateEncryptionTransport(url: URL): void;
/** Checks public framing only. It cannot authenticate a hint MAC or pack contents. */
export declare function parseEncryptedRoutingHint(key: string, bytes: Uint8Array, identity: GraftEncryptionDescriptor): EncryptedRoutingHint;
//# sourceMappingURL=encrypted.d.ts.map